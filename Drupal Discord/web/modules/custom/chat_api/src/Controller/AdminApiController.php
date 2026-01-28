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

}
