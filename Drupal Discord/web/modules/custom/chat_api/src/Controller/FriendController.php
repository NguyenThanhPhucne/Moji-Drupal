<?php

namespace Drupal\chat_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Drupal\user\Entity\User;
use Drupal\chat_api\Entity\ChatFriend;
use Drupal\chat_api\Entity\ChatFriendRequest;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class FriendController extends ControllerBase {

  /**
   * 1. Gửi lời mời kết bạn
   * POST /api/friends/requests
   */
  public function sendRequest(Request $request) {
    try {
      $currentUser = $this->getUserFromToken($request);
      if (!$currentUser) return new JsonResponse(['message' => 'Unauthorized'], 401);

      $data = json_decode($request->getContent(), TRUE);
      $toId = $data['to'] ?? null;
      $message = $data['message'] ?? '';

      if (!$toId) return new JsonResponse(['message' => 'Thiếu ID người nhận'], 400);

      $fromId = $currentUser->id();

      // Check: Không gửi cho chính mình
      if ($fromId == $toId) {
        return new JsonResponse(['message' => 'Không thể kết bạn với chính mình'], 400);
      }

      // Check: Người nhận có tồn tại không
      $toUser = User::load($toId);
      if (!$toUser) return new JsonResponse(['message' => 'Người dùng không tồn tại'], 404);

      // Check: Đã là bạn bè chưa
      $userA = min($fromId, $toId);
      $userB = max($fromId, $toId);
      
      $friends = \Drupal::entityTypeManager()->getStorage('chat_friend')
        ->getQuery()
        ->condition('user_a', $userA)
        ->condition('user_b', $userB)
        ->accessCheck(FALSE)
        ->execute();

      if (!empty($friends)) {
        return new JsonResponse(['message' => 'Hai người đã là bạn bè'], 400);
      }

      // Check: Đã có lời mời chưa (Chiều đi hoặc chiều về)
      $requests = \Drupal::entityTypeManager()->getStorage('chat_friend_request')
        ->getQuery()
        ->condition('from_user', $fromId)
        ->condition('to_user', $toId)
        ->accessCheck(FALSE)
        ->execute();
      
      // Check chiều ngược lại
      $reverseRequests = \Drupal::entityTypeManager()->getStorage('chat_friend_request')
        ->getQuery()
        ->condition('from_user', $toId)
        ->condition('to_user', $fromId)
        ->accessCheck(FALSE)
        ->execute();

      if (!empty($requests) || !empty($reverseRequests)) {
        return new JsonResponse(['message' => 'Đã có lời mời kết bạn đang chờ'], 400);
      }

      // Tạo Request
      $friendRequest = ChatFriendRequest::create([
        'from_user' => $fromId,
        'to_user' => $toId,
        'message' => $message,
      ]);
      $friendRequest->save();

      return new JsonResponse([
        'message' => 'Gửi lời mời thành công',
        'request' => [
          '_id' => $friendRequest->id(),
          'from' => $fromId,
          'to' => $toId
        ]
      ], 201);

    } catch (\Exception $e) {
      return new JsonResponse(['message' => 'Lỗi hệ thống: ' . $e->getMessage()], 500);
    }
  }

  /**
   * 2. Chấp nhận lời mời
   * POST /api/friends/requests/{requestId}/accept
   */
  public function acceptRequest(Request $request, $requestId) {
    try {
      $currentUser = $this->getUserFromToken($request);
      if (!$currentUser) return new JsonResponse(['message' => 'Unauthorized'], 401);

      $friendRequest = ChatFriendRequest::load($requestId);
      if (!$friendRequest) return new JsonResponse(['message' => 'Lời mời không tồn tại'], 404);

      // Chỉ người nhận mới được chấp nhận
      if ($friendRequest->get('to_user')->target_id != $currentUser->id()) {
        return new JsonResponse(['message' => 'Bạn không có quyền này'], 403);
      }

      // Tạo bạn bè
      ChatFriend::create([
        'user_a' => $friendRequest->get('from_user')->target_id,
        'user_b' => $friendRequest->get('to_user')->target_id,
      ])->save();

      // Xóa lời mời
      $friendRequest->delete();

      // Lấy thông tin người gửi để trả về cho Frontend hiển thị
      $fromUser = User::load($friendRequest->get('from_user')->target_id);

      return new JsonResponse([
        'message' => 'Đã chấp nhận kết bạn',
        'newFriend' => [
          '_id' => $fromUser->id(),
          'displayName' => $fromUser->get('field_display_name')->value,
          'avatarUrl' => null,
          'username' => $fromUser->getAccountName(),
        ]
      ]);

    } catch (\Exception $e) {
      return new JsonResponse(['message' => 'Lỗi hệ thống'], 500);
    }
  }

  /**
   * 3. Từ chối lời mời
   * POST /api/friends/requests/{requestId}/decline
   */
  public function declineRequest(Request $request, $requestId) {
    try {
      $currentUser = $this->getUserFromToken($request);
      if (!$currentUser) return new JsonResponse(['message' => 'Unauthorized'], 401);

      $friendRequest = ChatFriendRequest::load($requestId);
      if (!$friendRequest) return new JsonResponse(['message' => 'Lời mời không tồn tại'], 404);

      if ($friendRequest->get('to_user')->target_id != $currentUser->id()) {
        return new JsonResponse(['message' => 'Bạn không có quyền này'], 403);
      }

      $friendRequest->delete();
      return new JsonResponse(NULL, 204);

    } catch (\Exception $e) {
      return new JsonResponse(['message' => 'Lỗi hệ thống'], 500);
    }
  }

  /**
   * 4. Lấy danh sách bạn bè
   * GET /api/friends
   */
  public function getAllFriends(Request $request) {
    try {
      $currentUser = $this->getUserFromToken($request);
      if (!$currentUser) return new JsonResponse(['message' => 'Unauthorized'], 401);

      $uid = $currentUser->id();

      // Query: Tìm tất cả record mà user_a HOẶC user_b là mình
      $query = \Drupal::entityTypeManager()->getStorage('chat_friend')->getQuery();
      $group = $query->orConditionGroup()
        ->condition('user_a', $uid)
        ->condition('user_b', $uid);
      
      $ids = $query->condition($group)->accessCheck(FALSE)->execute();
      
      $friends = [];
      if (!empty($ids)) {
        $friendships = ChatFriend::loadMultiple($ids);
        foreach ($friendships as $f) {
          $idA = $f->get('user_a')->target_id;
          $idB = $f->get('user_b')->target_id;
          
          // Lấy ID của người kia
          $friendId = ($idA == $uid) ? $idB : $idA;
          $friendUser = User::load($friendId);

          if ($friendUser) {
            $friends[] = [
              '_id' => $friendUser->id(),
              'username' => $friendUser->getAccountName(),
              'displayName' => $friendUser->get('field_display_name')->value,
              'avatarUrl' => null
            ];
          }
        }
      }

      return new JsonResponse(['friends' => $friends]);

    } catch (\Exception $e) {
      return new JsonResponse(['message' => 'Lỗi hệ thống'], 500);
    }
  }

  /**
   * 5. Lấy danh sách lời mời (Sent & Received)
   * GET /api/friends/requests
   */
  public function getRequests(Request $request) {
    try {
      $currentUser = $this->getUserFromToken($request);
      if (!$currentUser) return new JsonResponse(['message' => 'Unauthorized'], 401);
      $uid = $currentUser->id();

      // Lấy lời mời ĐÃ NHẬN (Received)
      $receivedIds = \Drupal::entityTypeManager()->getStorage('chat_friend_request')
        ->getQuery()
        ->condition('to_user', $uid)
        ->accessCheck(FALSE)->execute();

      $received = [];
      foreach (ChatFriendRequest::loadMultiple($receivedIds) as $req) {
        $from = $req->get('from_user')->entity;
        if ($from) {
          $received[] = [
            '_id' => $req->id(),
            'from' => [
              '_id' => $from->id(),
              'username' => $from->getAccountName(),
              'displayName' => $from->get('field_display_name')->value,
              'avatarUrl' => null
            ],
            'message' => $req->get('message')->value
          ];
        }
      }

      // Lấy lời mời ĐÃ GỬI (Sent)
      $sentIds = \Drupal::entityTypeManager()->getStorage('chat_friend_request')
        ->getQuery()
        ->condition('from_user', $uid)
        ->accessCheck(FALSE)->execute();

      $sent = [];
      foreach (ChatFriendRequest::loadMultiple($sentIds) as $req) {
        $to = $req->get('to_user')->entity;
        if ($to) {
          $sent[] = [
            '_id' => $req->id(),
            'to' => [
              '_id' => $to->id(),
              'username' => $to->getAccountName(),
              'displayName' => $to->get('field_display_name')->value,
              'avatarUrl' => null
            ],
            'message' => $req->get('message')->value
          ];
        }
      }

      return new JsonResponse(['received' => $received, 'sent' => $sent]);

    } catch (\Exception $e) {
      return new JsonResponse(['message' => 'Lỗi hệ thống'], 500);
    }
  }

  // Helper Auth
  private function getUserFromToken(Request $request) {
    $authHeader = $request->headers->get('Authorization');
    if (!$authHeader || !str_starts_with($authHeader, 'Bearer ')) return null;
    $token = substr($authHeader, 7);
    $key = $_ENV['ACCESS_TOKEN_SECRET'] ?? 'fallback_secret';
    try {
      $decoded = JWT::decode($token, new Key($key, 'HS256'));
      return User::load($decoded->userId);
    } catch (\Exception $e) { return null; }
  }
}
