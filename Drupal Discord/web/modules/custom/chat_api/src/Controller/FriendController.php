<?php

namespace Drupal\chat_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Drupal\Core\Database\Database;
use Drupal\user\Entity\User;
use Drupal\Core\Site\Settings;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

/**
 * Controller quản lý tính năng Bạn bè & Lời mời.
 */
class FriendController extends ControllerBase {

  /**
   * API 1: Gửi lời mời kết bạn (POST /api/friends/requests)
   */
  public function sendRequest(Request $request) {
    try {
      $currentUser = $this->getUserFromToken($request);
      if (!$currentUser) return new JsonResponse(['message' => 'Phiên đăng nhập hết hạn'], 401);

      $data = json_decode($request->getContent(), TRUE);
      $toId = $data['to_user_id'] ?? null; // ID người nhận

      if (!$toId) return new JsonResponse(['message' => 'Thiếu ID người nhận'], 400);

      $fromId = (int) $currentUser->id();
      $toId = (int) $toId;

      if ($fromId === $toId) return new JsonResponse(['message' => 'Không thể tự kết bạn'], 400);

      $connection = Database::getConnection();

      // 1. Kiểm tra đã là bạn chưa
      $isFriend = $connection->select('chat_friend', 'cf')
        ->fields('cf', ['id'])
        ->condition($connection->condition('OR')
          ->condition($connection->condition('AND')->condition('user_a', $fromId)->condition('user_b', $toId))
          ->condition($connection->condition('AND')->condition('user_a', $toId)->condition('user_b', $fromId))
        )
        ->execute()->fetchField();

      if ($isFriend) return new JsonResponse(['message' => 'Hai người đã là bạn bè'], 400);

      // 2. Kiểm tra đã gửi lời mời chưa (tránh spam)
      $existingReq = $connection->select('chat_friend_request', 'cfr')
        ->fields('cfr', ['id'])
        ->condition('from_user', $fromId)
        ->condition('to_user', $toId)
        ->condition('status', 'pending')
        ->execute()->fetchField();

      if ($existingReq) return new JsonResponse(['message' => 'Đã gửi lời mời trước đó'], 400);

      // 3. Lưu vào DB
      $connection->insert('chat_friend_request')
        ->fields([
          'from_user' => $fromId,
          'to_user' => $toId,
          'status' => 'pending',
          'created' => \Drupal::time()->getRequestTime(),
        ])->execute();

      // Invalidate admin cache cho recipient (người nhận)
      \Drupal::service('cache.default')->invalidate("user_detail_{$toId}");
      \Drupal::service('cache.default')->invalidate("user_stats_{$toId}");

      return new JsonResponse(['message' => 'Gửi lời mời thành công'], 201);

    } catch (\Exception $e) {
      return new JsonResponse(['message' => 'Lỗi: ' . $e->getMessage()], 500);
    }
  }

  /**
   * API 2: Lấy danh sách lời mời kết bạn (GET /api/friends/requests)
   * [CẬP NHẬT] Đã thêm logic lấy Avatar để hiển thị đẹp trên React
   */
  public function getRequests(Request $request) {
    try {
      $currentUser = $this->getUserFromToken($request);
      if (!$currentUser) return new JsonResponse(['message' => 'Unauthorized'], 401);
      
      $uid = $currentUser->id();
      $connection = Database::getConnection();

      // Query lấy request gửi CHO MÌNH
      $query = $connection->select('chat_friend_request', 'cfr');
      $query->fields('cfr', ['id', 'created', 'from_user']);
      $query->condition('cfr.to_user', $uid);
      $query->condition('cfr.status', 'pending');
      $results = $query->execute()->fetchAll();

      // Format dữ liệu + Lấy Avatar
      $formatted = array_map(function($item) {
        // Load User người gửi để lấy thông tin chi tiết
        $sender = User::load($item->from_user);
        
        // Lấy link avatar từ Cloudinary (nếu có)
        $avatar = $sender->hasField('field_avatar_url') ? $sender->get('field_avatar_url')->value : null;
        
        // Lấy tên hiển thị
        $name = $sender->hasField('field_display_name') ? $sender->get('field_display_name')->value : $sender->getAccountName();

        return [
          '_id' => $item->id, // ID request số (dùng để Accept)
          'from' => [
            '_id' => $sender->id(),
            'username' => $sender->getAccountName(),
            'displayName' => $name,
            'avatarUrl' => $avatar // [QUAN TRỌNG] React cần cái này
          ],
          'created' => $item->created
        ];
      }, $results);

      return new JsonResponse($formatted);

    } catch (\Exception $e) {
      return new JsonResponse(['message' => $e->getMessage()], 500);
    }
  }

  /**
   * API 3: Lấy danh sách bạn bè đã kết bạn (GET /api/friends)
   * [CẬP NHẬT] Bổ sung logic lấy Avatar
   */
  public function getAllFriends(Request $request) {
    try {
      $currentUser = $this->getUserFromToken($request);
      if (!$currentUser) return new JsonResponse(['message' => 'Unauthorized'], 401);

      $uid = (int) $currentUser->id();
      $connection = Database::getConnection();

      // Tìm trong bảng chat_friend, mình có thể là user_a hoặc user_b
      $query = $connection->select('chat_friend', 'cf');
      $query->fields('cf', ['user_a', 'user_b']);
      $query->condition($query->orConditionGroup()
        ->condition('user_a', $uid)
        ->condition('user_b', $uid)
      );
      $query->condition('status', 'active');
      $results = $query->execute()->fetchAll();

      $friends = [];
      foreach ($results as $row) {
        // Xác định ID của người kia (người không phải là mình)
        $friendId = ($row->user_a == $uid) ? $row->user_b : $row->user_a;
        
        $friendUser = User::load($friendId);
        if ($friendUser) {
          $avatar = $friendUser->hasField('field_avatar_url') ? $friendUser->get('field_avatar_url')->value : null;
          $name = $friendUser->hasField('field_display_name') ? $friendUser->get('field_display_name')->value : $friendUser->getAccountName();

          $friends[] = [
            '_id' => $friendUser->id(),
            'username' => $friendUser->getAccountName(),
            'displayName' => $name,
            'avatarUrl' => $avatar, // Avatar của bạn bè
            'isOnline' => false // Node.js sẽ xử lý phần online sau
          ];
        }
      }

      return new JsonResponse($friends);

    } catch (\Exception $e) {
      return new JsonResponse(['message' => $e->getMessage()], 500);
    }
  }

  /**
   * API 4: Chấp nhận kết bạn (POST)
   */
  public function acceptRequest(Request $request, $requestId) {
    try {
      $currentUser = $this->getUserFromToken($request);
      if (!$currentUser) return new JsonResponse(['message' => 'Unauthorized'], 401);

      $connection = Database::getConnection();

      // Tìm request
      $reqData = $connection->select('chat_friend_request', 'cfr')
        ->fields('cfr')
        ->condition('id', $requestId)
        ->execute()->fetchObject();

      if (!$reqData) return new JsonResponse(['message' => 'Lời mời không tồn tại'], 404);

      if ($reqData->to_user != $currentUser->id()) {
        return new JsonResponse(['message' => 'Không có quyền'], 403);
      }

      $transaction = $connection->startTransaction();
      try {
        // Thêm vào bảng bạn bè
        $connection->insert('chat_friend')
          ->fields([
            'user_a' => $reqData->from_user,
            'user_b' => $reqData->to_user,
            'status' => 'active',
            'created' => \Drupal::time()->getRequestTime(),
          ])->execute();

        // Xóa lời mời
        $connection->delete('chat_friend_request')
          ->condition('id', $requestId)
          ->execute();

        return new JsonResponse(['message' => 'Đã chấp nhận kết bạn'], 200);

      } catch (\Exception $e) {
        $transaction->rollBack();
        throw $e;
      }

    } catch (\Exception $e) {
      return new JsonResponse(['message' => 'Lỗi: ' . $e->getMessage()], 500);
    }
  }

  /**
   * API 5: Từ chối lời mời (POST)
   */
  public function declineRequest(Request $request, $requestId) {
    try {
        $currentUser = $this->getUserFromToken($request);
        if (!$currentUser) return new JsonResponse(['message' => 'Unauthorized'], 401);
  
        $connection = Database::getConnection();
        
        $reqData = $connection->select('chat_friend_request', 'cfr')
          ->fields('cfr')
          ->condition('id', $requestId)
          ->execute()->fetchObject();

        if (!$reqData) return new JsonResponse(['message' => 'Not Found'], 404);
        if ($reqData->to_user != $currentUser->id()) return new JsonResponse(['message' => 'Forbidden'], 403);

        $connection->delete('chat_friend_request')->condition('id', $requestId)->execute();
        
        return new JsonResponse(['message' => 'Đã từ chối'], 200);
    } catch (\Exception $e) {
        return new JsonResponse(['message' => $e->getMessage()], 500);
    }
  }

  /**
   * Helper: Check quan hệ bạn bè (Dùng cho nút "Add Friend" trên UI)
   * GET /api/friends/check?userB={id}
   */
  public function checkFriendship(Request $request) {
    $currentUser = $this->getUserFromToken($request);
    if (!$currentUser) return new JsonResponse(['isFriend' => false, 'status' => 'none']);

    $userB = $request->query->get('userB');
    $userA = $currentUser->id();
    $connection = Database::getConnection();

    // 1. Check Friends
    $isFriend = $connection->select('chat_friend', 'cf')
      ->fields('cf', ['id'])
      ->condition($connection->condition('OR')
        ->condition($connection->condition('AND')->condition('user_a', $userA)->condition('user_b', $userB))
        ->condition($connection->condition('AND')->condition('user_a', $userB)->condition('user_b', $userA))
      )->execute()->fetchField();

    if ($isFriend) return new JsonResponse(['isFriend' => true, 'status' => 'friend']);

    // 2. Check Sent Request (Mình gửi đi)
    $sent = $connection->select('chat_friend_request', 'cfr')
      ->fields('cfr', ['id'])
      ->condition('from_user', $userA)
      ->condition('to_user', $userB)
      ->execute()->fetchField();
    
    if ($sent) return new JsonResponse(['isFriend' => false, 'status' => 'sent']);

    // 3. Check Received Request (Họ gửi đến)
    $received = $connection->select('chat_friend_request', 'cfr')
      ->fields('cfr', ['id'])
      ->condition('from_user', $userB)
      ->condition('to_user', $userA)
      ->execute()->fetchField();

    if ($received) return new JsonResponse(['isFriend' => false, 'status' => 'received']);

    return new JsonResponse(['isFriend' => false, 'status' => 'none']);
  }

  // Helper Auth
  private function getUserFromToken(Request $request) {
    $authHeader = $request->headers->get('Authorization');
    if (!$authHeader || !str_starts_with($authHeader, 'Bearer ')) return null;
    $token = substr($authHeader, 7);
    $key = Settings::get('chat_api_access_token_secret', 'fallback_secret_key');
    try {
      $decoded = JWT::decode($token, new Key($key, 'HS256'));
      return User::load($decoded->userId);
    } catch (\Exception $e) { return null; }
  }
}