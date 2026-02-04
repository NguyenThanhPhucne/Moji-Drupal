<?php

namespace Drupal\chat_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Database\Connection;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Drupal\user\Entity\User;

/**
 * Admin API Controller for AJAX requests.
 */
class AdminApiController extends ControllerBase {

  /**
   * The database connection.
   *
   * @var \Drupal\Core\Database\Connection
   */
  protected $database;

  /**
   * Constructs an AdminApiController object.
   */
  public function __construct(Connection $database) {
    $this->database = $database;
  }

  /**
   * {@inheritdoc}
   */
  public static function create(ContainerInterface $container) {
    return new static(
      $container->get('database')
    );
  }

  /**
   * Block a user via AJAX.
   */
  public function blockUser(Request $request) {
    // Validate CSRF token
    $token = $request->headers->get('X-CSRF-Token');
    if (!\Drupal::csrfToken()->validate($token, 'rest')) {
      return new JsonResponse([
        'success' => false,
        'message' => $this->t('Invalid CSRF token'),
      ], 403);
    }

    // Check permissions
    if (!$this->currentUser()->hasPermission('administer users')) {
      return new JsonResponse([
        'success' => false,
        'message' => $this->t('Access denied'),
      ], 403);
    }
    
    $uid = $request->request->get('uid');
    
    if (!$uid || $uid <= 1) {
      return new JsonResponse([
        'success' => false,
        'message' => $this->t('Invalid user ID'),
      ], 400);
    }

    try {
      $user = User::load($uid);
      
      if (!$user) {
        return new JsonResponse([
          'success' => false,
          'message' => $this->t('User not found'),
        ], 404);
      }

      // Block the user
      $user->block();
      $user->save();

      return new JsonResponse([
        'success' => true,
        'message' => $this->t('User @name has been blocked', ['@name' => $user->getAccountName()]),
        'user' => [
          'uid' => $user->id(),
          'name' => $user->getAccountName(),
          'status' => 0,
        ],
      ]);

    } catch (\Exception $e) {
      return new JsonResponse([
        'success' => false,
        'message' => $this->t('Error blocking user: @error', ['@error' => $e->getMessage()]),
      ], 500);
    }
  }

  /**
   * Unblock a user via AJAX.
   */
  public function unblockUser(Request $request) {
    // Validate CSRF token
    $token = $request->headers->get('X-CSRF-Token');
    if (!\Drupal::csrfToken()->validate($token, 'rest')) {
      return new JsonResponse([
        'success' => false,
        'message' => $this->t('Invalid CSRF token'),
      ], 403);
    }

    // Check permissions
    if (!$this->currentUser()->hasPermission('administer users')) {
      return new JsonResponse([
        'success' => false,
        'message' => $this->t('Access denied'),
      ], 403);
    }
    
    $uid = $request->request->get('uid');
    
    if (!$uid || $uid <= 1) {
      return new JsonResponse([
        'success' => false,
        'message' => $this->t('Invalid user ID'),
      ], 400);
    }

    try {
      $user = User::load($uid);
      
      if (!$user) {
        return new JsonResponse([
          'success' => false,
          'message' => $this->t('User not found'),
        ], 404);
      }

      // Unblock the user
      $user->activate();
      $user->save();

      return new JsonResponse([
        'success' => true,
        'message' => $this->t('User @name has been unblocked', ['@name' => $user->getAccountName()]),
        'user' => [
          'uid' => $user->id(),
          'name' => $user->getAccountName(),
          'status' => 1,
        ],
      ]);

    } catch (\Exception $e) {
      return new JsonResponse([
        'success' => false,
        'message' => $this->t('Error unblocking user: @error', ['@error' => $e->getMessage()]),
      ], 500);
    }
  }

  /**
   * Get user detail data as JSON for auto-refresh.
   * Used by user-detail-refresh.js to check for real-time updates.
   */
  public function getUserDetailJson($uid) {
    try {
      // Load user
      $user = User::load($uid);
      if (!$user) {
        return new JsonResponse([
          'success' => false,
          'message' => 'User not found',
        ], 404);
      }

      // Get avatar
      $avatarUrl = null;
      if ($user->hasField('field_avatar_url') && !$user->get('field_avatar_url')->isEmpty()) {
        $avatarUrl = $user->get('field_avatar_url')->value;
      }

      // Get basic user info
      $user_info = [
        'uid' => $user->id(),
        'name' => $user->getAccountName(),
        'email' => $user->getEmail(),
        'created' => $user->getCreatedTime(),
        'access' => $user->getLastAccessedTime(),
        'login' => $user->getLastLoginTime(),
        'status' => $user->isActive(),
        'avatarUrl' => $avatarUrl,
      ];

      // Get stats - reuse logic from AdminController
      $stats = [
        'friends_count' => $this->getUserFriendCount($uid),
        'pending_sent' => $this->getUserPendingRequestsSent($uid),
        'pending_received' => $this->getUserPendingRequestsReceived($uid),
        'days_registered' => floor((time() - $user->getCreatedTime()) / 86400),
        'last_seen_days' => $user->getLastAccessedTime() > 0 ? 
          floor((time() - $user->getLastAccessedTime()) / 86400) : null,
      ];

      return new JsonResponse([
        'success' => true,
        'user_info' => $user_info,
        'stats' => $stats,
      ]);

    } catch (\Exception $e) {
      return new JsonResponse([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage(),
      ], 500);
    }
  }

  /**
   * Get friend count for a user.
   */
  private function getUserFriendCount($uid) {
    // Count user_a cases
    $count_a = $this->database->select('chat_friend', 'cf')
      ->fields('cf', ['id'])
      ->condition('cf.user_a', $uid)
      ->countQuery()
      ->execute()
      ->fetchField();
      
    // Count user_b cases
    $count_b = $this->database->select('chat_friend', 'cf')
      ->fields('cf', ['id'])
      ->condition('cf.user_b', $uid)
      ->countQuery()
      ->execute()
      ->fetchField();
      
    return (int) $count_a + (int) $count_b;
  }

  /**
   * Get pending requests sent by user.
   */
  private function getUserPendingRequestsSent($uid) {
    return (int) $this->database->select('chat_friend_request', 'cfr')
      ->fields('cfr', ['id'])
      ->condition('cfr.from_user', $uid)
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Get pending requests received by user.
   */
  private function getUserPendingRequestsReceived($uid) {
    return (int) $this->database->select('chat_friend_request', 'cfr')
      ->fields('cfr', ['id'])
      ->condition('cfr.to_user', $uid)
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Get statistics data for dashboard.
   */
  public function getStats() {
    // TODO: Implement comprehensive statistics API
    
    $stats = [
      'success' => true,
      'data' => [
        'users' => [
          'total' => 0, // TODO: Get from database
          'active_today' => 0,
          'active_this_week' => 0,
          'new_this_month' => 0,
        ],
        'messages' => [
          'total' => 0, // TODO: Fetch from Node.js
          'today' => 0,
          'this_week' => 0,
          'this_month' => 0,
        ],
        'conversations' => [
          'total' => 0, // TODO: Fetch from Node.js
          'active' => 0,
        ],
        'friends' => [
          'total' => 0, // TODO: Get from database
          'pending_requests' => 0,
        ],
      ],
      'chart_data' => [
        'labels' => [], // TODO: Last 7 days
        'messages_per_day' => [], // TODO: Fetch from Node.js
        'new_users_per_day' => [], // TODO: Get from database
      ],
    ];
    
    return new JsonResponse($stats);
  }

  /**
   * Proxy endpoint to get conversations from Node.js API.
   * This allows browser to call Drupal API which then forwards to Node.js.
   */
  public function getConversationsProxy() {
    // Check permissions
    if (!$this->currentUser()->hasPermission('moderate chat')) {
      return new JsonResponse([
        'success' => false,
        'message' => $this->t('Access denied'),
      ], 403);
    }

    $node_api_url = 'http://localhost:5001/api/conversations/admin/conversations';
    
    try {
      $response = \Drupal::httpClient()->get($node_api_url, [
        'timeout' => 10,
      ]);
      
      $statusCode = $response->getStatusCode();
      $body = $response->getBody()->getContents();
      
      // Return the response as-is from Node.js
      return new JsonResponse(
        json_decode($body, TRUE),
        $statusCode
      );
      
    } catch (\Exception $e) {
      \Drupal::logger('chat_api')->error('❌ Proxy error: @error', [
        '@error' => $e->getMessage(),
      ]);
      
      return new JsonResponse([
        'success' => false,
        'message' => $this->t('Failed to connect to Node.js server: @error', [
          '@error' => $e->getMessage(),
        ]),
        'data' => [],
        'stats' => [
          'totalConversations' => 0,
          'privateConversations' => 0,
          'groupConversations' => 0,
          'activeTodayCount' => 0,
          'totalMessages' => 0,
          'avgParticipants' => 0,
        ],
      ], 500);
    }
  }

  /**
   * Proxy endpoint to delete conversation via Node.js API.
   */
  public function deleteConversationProxy($conversation_id) {
    // Check permissions
    if (!$this->currentUser()->hasPermission('administer chat')) {
      return new JsonResponse([
        'success' => false,
        'message' => $this->t('Access denied'),
      ], 403);
    }

    $node_api_url = 'http://localhost:5001/api/conversations/admin/' . $conversation_id;
    
    try {
      $response = \Drupal::httpClient()->delete($node_api_url, [
        'timeout' => 10,
      ]);
      
      $statusCode = $response->getStatusCode();
      $body = $response->getBody()->getContents();
      
      return new JsonResponse(
        json_decode($body, TRUE),
        $statusCode
      );
      
    } catch (\Exception $e) {
      \Drupal::logger('chat_api')->error('❌ Delete proxy error: @error', [
        '@error' => $e->getMessage(),
      ]);
      
      return new JsonResponse([
        'success' => false,
        'message' => $this->t('Failed to delete conversation: @error', [
          '@error' => $e->getMessage(),
        ]),
      ], 500);
    }
  }

}
