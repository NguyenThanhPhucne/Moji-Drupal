<?php

namespace Drupal\chat_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Drupal\user\Entity\User;
use Drupal\Core\Site\Settings;

class AuthController extends ControllerBase {

  /**
   * ĐĂNG KÝ
   */
  public function signUp(Request $request) {
    $content = $request->getContent();
    $data = json_decode($content, TRUE);

    $username = $data['username'] ?? '';
    $password = $data['password'] ?? '';
    $email = $data['email'] ?? '';
    $firstName = $data['firstName'] ?? '';
    $lastName = $data['lastName'] ?? '';

    if (empty($username) || empty($password) || empty($email)) {
      return new JsonResponse(['message' => 'Thiếu thông tin bắt buộc'], 400);
    }

    if (user_load_by_name($username)) {
      return new JsonResponse(['message' => 'Username đã tồn tại'], 409);
    }

    if (user_load_by_mail($email)) {
      return new JsonResponse(['message' => 'Email đã tồn tại'], 409);
    }

    try {
      $user = User::create([
        'name' => $username,
        'mail' => $email,
        'pass' => $password,
        'status' => 1,
      ]);
      $user->save();
      user_login_finalize($user);
      return new JsonResponse(NULL, 204);

    } catch (\Exception $e) {
      \Drupal::logger('chat_api')->error($e->getMessage());
      return new JsonResponse(['message' => 'Lỗi hệ thống'], 500);
    }
  }

  /**
   * ĐĂNG NHẬP
   */
  public function signIn(Request $request) {
    $content = $request->getContent();
    $data = json_decode($content, TRUE);

    $username = $data['username'] ?? '';
    $password = $data['password'] ?? '';

    $uid = \Drupal::service('user.auth')->authenticate($username, $password);

    if (!$uid) {
      return new JsonResponse(['message' => 'Sai tài khoản hoặc mật khẩu'], 401);
    }

    $user = User::load($uid);
    
    // 1. CẤP COOKIE SESSION (Cho Drupal API)
    user_login_finalize($user);

    // 2. CẤP JWT TOKEN (Cho Node.js Chat)
    $key = Settings::get('chat_api_access_token_secret', 'fallback_secret_key');
    $jwt = $this->generateJwt($user, $key);

    return new JsonResponse([
      'message' => "Đăng nhập thành công",
      'accessToken' => $jwt, 
      'user' => [
        '_id' => $user->id(),
        'uid' => $user->id(),
        'username' => $user->getAccountName(),
        'displayName' => $user->getAccountName(),
        'avatarUrl' => null, 
        'csrf_token' => \Drupal::service('csrf_token')->get('rest'),
      ]
    ], 200);
  }

  /**
   * ĐĂNG XUẤT
   */
  public function signOut(Request $request) {
    user_logout();
    return new JsonResponse(NULL, 204);
  }

  /**
   * REFRESH TOKEN
   */
  public function refreshToken(Request $request) {
    $user = \Drupal::currentUser();
    if ($user->isAnonymous()) {
      return new JsonResponse(['message' => 'Hết phiên đăng nhập'], 401);
    }
    
    $account = User::load($user->id());
    $key = Settings::get('chat_api_access_token_secret', 'fallback_secret_key');
    $jwt = $this->generateJwt($account, $key);

    return new JsonResponse(['accessToken' => $jwt], 200);
  }

  /**
   * Helper: Tạo JWT thủ công (ĐÃ SỬA: Thêm username và email)
   */
  private function generateJwt($user, $key) {
    $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
    
    // --- QUAN TRỌNG: Thêm username để Node.js sync ---
    $payload = json_encode([
      'userId' => $user->id(),
      'username' => $user->getAccountName(), // <--- DÒNG NÀY CỨU BẠN KHỎI LỖI 404
      'email' => $user->getEmail(),
      'iat' => time(),
      'exp' => time() + (60 * 60 * 24 * 14) 
    ]);

    $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
    $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));

    $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, $key, true);
    $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

    return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
  }
}
