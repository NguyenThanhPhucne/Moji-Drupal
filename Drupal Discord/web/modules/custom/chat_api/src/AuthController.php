<?php

namespace Drupal\chat_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Cookie;
use Drupal\user\Entity\User;
use Drupal\chat_api\Entity\ChatSession;
use Firebase\JWT\JWT;
use MongoDB\Client; 

class AuthController extends ControllerBase {

  const ACCESS_TOKEN_TTL = 1800; 
  const REFRESH_TOKEN_TTL = 1209600; 

  // --- 1. ĐĂNG KÝ (CÓ SYNC MONGO) ---
  public function signUp(Request $request) {
    try {
      $data = json_decode($request->getContent(), TRUE);
      
      if (empty($data['username']) || empty($data['password']) || empty($data['email'])) {
        return new JsonResponse(['message' => 'Thiếu thông tin'], 400);
      }
      
      // Check Drupal User tồn tại
      if (!empty(\Drupal::entityTypeManager()->getStorage('user')->loadByProperties(['name' => $data['username']]))) {
        return new JsonResponse(['message' => 'Username đã tồn tại'], 409);
      }

      // A. TẠO USER TRONG DRUPAL (MySQL)
      $user = User::create([
        'name' => $data['username'],
        'mail' => $data['email'],
        'pass' => $data['password'],
        'status' => 1,
        'field_display_name' => $data['lastName'] . ' ' . $data['firstName'],
      ]);
      $user->save();

      // B. ĐỒNG BỘ SANG MONGODB
      try {
        // Lấy chuỗi kết nối từ .env
        $mongoUri = $_ENV['MONGODB_CONNECTIONSTRING'] ?? 'mongodb://localhost:27017';
        $client = new Client($mongoUri);
        
        // Chọn database 'test' và collection 'users'
        $collection = $client->test->users; 

        // Insert vào Mongo
        $insertOneResult = $collection->insertOne([
          'username' => $data['username'],
          'email' => $data['email'],
          'displayName' => $data['lastName'] . ' ' . $data['firstName'],
          'avatarUrl' => null,
          'createdAt' => new \MongoDB\BSON\UTCDateTime(),
          'updatedAt' => new \MongoDB\BSON\UTCDateTime(),
          '__v' => 0
        ]);

        // Lấy ObjectId vừa tạo
        $mongoId = (string) $insertOneResult->getInsertedId();

        // C. LƯU MONGO ID NGƯỢC LẠI VÀO DRUPAL
        $user->set('field_mongo_id', $mongoId);
        $user->save();

      } catch (\Exception $mongoError) {
        // Nếu lỗi Mongo thì xóa user Drupal để rollback
        $user->delete();
        \Drupal::logger('chat_api')->error('Mongo Sync Error: ' . $mongoError->getMessage());
        return new JsonResponse(['message' => 'Lỗi đồng bộ dữ liệu MongoDB'], 500);
      }

      return new JsonResponse(NULL, 204);

    } catch (\Exception $e) {
      \Drupal::logger('chat_api')->error($e->getMessage());
      return new JsonResponse(['message' => 'Lỗi hệ thống'], 500);
    }
  }

  // --- 2. ĐĂNG NHẬP (TRẢ VỀ ID MONGO) ---
  public function signIn(Request $request) {
    try {
      $data = json_decode($request->getContent(), TRUE);
      $uid = \Drupal::service('user.auth')->authenticate($data['username'], $data['password']);
      if (!$uid) return new JsonResponse(['message' => 'Sai thông tin'], 401);

      $user = User::load($uid);
      
      // Tạo Token bằng MongoID
      $accessToken = $this->generateJWT($user); 
      $refreshToken = bin2hex(random_bytes(64));

      // Lưu Session
      ChatSession::create([
        'user_id' => $user->id(),
        'refresh_token' => $refreshToken,
        'expires_at' => time() + self::REFRESH_TOKEN_TTL,
      ])->save();

      $cookie = new Cookie('refreshToken', $refreshToken, time() + self::REFRESH_TOKEN_TTL, '/', NULL, FALSE, TRUE, FALSE, 'Lax');

      // Response trả về _id là MongoID
      $mongoId = $user->get('field_mongo_id')->value;
      
      $response = new JsonResponse([
        'message' => 'Đăng nhập thành công',
        'accessToken' => $accessToken,
        'user' => [
          '_id' => $mongoId ?: $user->id(), // Ưu tiên MongoID
          'username' => $user->getAccountName(),
          'displayName' => $user->get('field_display_name')->value,
          'avatarUrl' => null
        ]
      ]);
      $response->headers->setCookie($cookie);
      return $response;
    } catch (\Exception $e) {
      \Drupal::logger('chat_api')->error($e->getMessage());
      return new JsonResponse(['message' => 'Lỗi hệ thống'], 500);
    }
  }

  // --- 3. CÁC HÀM KHÁC GIỮ NGUYÊN ---
  public function signOut(Request $request) {
    $token = $request->cookies->get('refreshToken');
    if ($token) {
      $sessions = \Drupal::entityTypeManager()->getStorage('chat_session')->loadByProperties(['refresh_token' => $token]);
      foreach ($sessions as $s) $s->delete();
    }
    $res = new JsonResponse(['message' => 'Đã đăng xuất']);
    $res->headers->clearCookie('refreshToken');
    return $res;
  }

  public function refreshToken(Request $request) {
    $token = $request->cookies->get('refreshToken');
    if (!$token) return new JsonResponse(['message' => 'Chưa đăng nhập'], 401);

    $sessions = \Drupal::entityTypeManager()->getStorage('chat_session')->loadByProperties(['refresh_token' => $token]);
    if (empty($sessions)) return new JsonResponse(['message' => 'Token lỗi'], 403);

    $session = reset($sessions);
    if ($session->get('expires_at')->value < time()) {
      $session->delete();
      return new JsonResponse(['message' => 'Hết hạn phiên'], 403);
    }

    return new JsonResponse(['accessToken' => $this->generateJWT($session->get('user_id')->entity)]);
  }

  // --- HELPER: JWT DÙNG MONGO ID ---
  private function generateJWT($user) {
    $key = $_ENV['ACCESS_TOKEN_SECRET'] ?? 'fallback_secret';
    
    // Lấy Mongo ID từ field đã lưu
    $mongoId = $user->get('field_mongo_id')->value;

    // Nếu chưa có (user cũ) thì fallback về ID thường
    if (!$mongoId) $mongoId = $user->id();

    $payload = [
      'userId' => $mongoId, // Node.js sẽ nhận ID này để query Mongo
      'username' => $user->getAccountName(),
      'exp' => time() + self::ACCESS_TOKEN_TTL
    ];
    return JWT::encode($payload, $key, 'HS256');
  }
}
