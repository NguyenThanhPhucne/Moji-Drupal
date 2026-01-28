<?php

namespace Drupal\chat_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Database\Connection;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Drupal\Core\Url;

/**
 * Admin Controller for Chat Administration.
 * 
 * Provides admin interface for managing users, conversations, and viewing reports.
 */
class AdminController extends ControllerBase {

  /**
   * The database connection.
   *
   * @var \Drupal\Core\Database\Connection
   */
  protected $database;

  /**
   * Constructs an AdminController object.
   *
   * @param \Drupal\Core\Database\Connection $database
   *   The database connection.
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
   * Dashboard - Main admin overview page with comprehensive statistics.
   * 
   * Displays overview statistics, activity trends, and system health.
   */
  public function dashboard() {
    // Get comprehensive statistics
    $stats = [
      'total_users' => $this->getTotalUsers(),
      'active_users_today' => $this->getActiveUsersToday(),
      'active_users_week' => $this->getActiveUsersThisWeek(),
      'total_friends' => $this->getTotalFriendships(),
      'pending_requests' => $this->getPendingRequests(),
      'new_users_today' => $this->getNewUsersToday(),
      'new_users_week' => $this->getNewUsersThisWeek(),
      'blocked_users' => $this->getBlockedUsers(),
    ];

    // Get activity trends for charts (last 7 days)
    $activity_trends = $this->getActivityTrends();

    // Get recent statistics
    $recent_stats = [
      'recent_users' => $this->getRecentUsers(5),
      'recent_requests' => $this->getRecentFriendRequests(5),
    ];

    // System health check
    $system_health = [
      'database_status' => 'OK',
      'total_records' => $this->getTotalUsers() + $this->getTotalFriendships(),
    ];
    
    $build = [
      '#theme' => 'chat_admin_dashboard',
      '#stats' => $stats,
      '#activity_trends' => $activity_trends,
      '#recent_stats' => $recent_stats,
      '#system_health' => $system_health,
      '#cache' => [
        'max-age' => 300, // Cache for 5 minutes
        'contexts' => ['user.permissions'],
        'tags' => ['chat_api:dashboard'],
      ],
      '#attached' => [
        'library' => ['chat_api/admin', 'chat_api/charts'],
        'drupalSettings' => [
          'chatAdmin' => [
            'activityTrends' => $activity_trends,
            'stats' => $stats,
          ],
        ],
      ],
    ];
    
    return $build;
  }

  /**
   * Users list page - Display all users with comprehensive data.
   */
  public function usersList() {
    // Get all users with basic info
    $query = $this->database->select('users_field_data', 'u')
      ->fields('u', ['uid', 'name', 'mail', 'created', 'access', 'status'])
      ->condition('u.uid', 0, '>')
      ->orderBy('u.created', 'DESC')
      ->extend('Drupal\Core\Database\Query\PagerSelectExtender')
      ->limit(25);
    
    $users = $query->execute()->fetchAll();
    
    // Enrich each user with additional data
    foreach ($users as $user) {
      // Get friend count
      $user->friend_count = $this->getUserFriendCount($user->uid);
      
      // Get friend request counts (sent + received)
      $user->pending_requests = $this->getUserPendingRequests($user->uid);
      
      // Calculate days since registration
      $user->days_registered = floor((time() - $user->created) / 86400);
      
      // Calculate days since last access
      $user->days_since_access = $user->access > 0 ? floor((time() - $user->access) / 86400) : null;
    }
    
    // Get summary statistics
    $stats = [
      'total_users' => $this->getTotalUsers(),
      'active_today' => $this->getActiveUsersToday(),
      'active_week' => $this->getActiveUsersThisWeek(),
      'blocked_users' => $this->getBlockedUsers(),
    ];
    
    $build = [
      '#theme' => 'chat_admin_users',
      '#users' => $users,
      '#stats' => $stats,
      '#cache' => [
        'max-age' => 60, // Cache for 1 minute (more dynamic than dashboard)
        'contexts' => ['user.permissions', 'url.query_args'],
      ],
      '#attached' => [
        'library' => ['chat_api/admin', 'chat_api/admin-tables'],
        'drupalSettings' => [
          'csrf_token' => \Drupal::csrfToken()->get('rest'),
        ],
      ],
    ];
    
    $build['pager'] = [
      '#type' => 'pager',
    ];
    
    return $build;
  }
  
  /**
   * Get friend count for a specific user.
   */
  private function getUserFriendCount($uid) {
    // Count where user is either user_a or user_b
    $count_a = $this->database->select('chat_friend', 'cf')
      ->fields('cf', ['id'])
      ->condition('cf.user_a', $uid)
      ->countQuery()
      ->execute()
      ->fetchField();
      
    $count_b = $this->database->select('chat_friend', 'cf')
      ->fields('cf', ['id'])
      ->condition('cf.user_b', $uid)
      ->countQuery()
      ->execute()
      ->fetchField();
      
    return (int) $count_a + (int) $count_b;
  }
  
  /**
   * Get pending friend requests for a user (sent + received).
   */
  private function getUserPendingRequests($uid) {
    $sent = $this->database->select('chat_friend_request', 'cfr')
      ->fields('cfr', ['id'])
      ->condition('cfr.from_user', $uid)
      ->countQuery()
      ->execute()
      ->fetchField();
      
    $received = $this->database->select('chat_friend_request', 'cfr')
      ->fields('cfr', ['id'])
      ->condition('cfr.to_user', $uid)
      ->countQuery()
      ->execute()
      ->fetchField();
      
    return (int) $sent + (int) $received;
  }

  /**
   * User detail page - Comprehensive user profile and statistics.
   */
  public function userDetail($uid) {
    // Load user entity
    $user = \Drupal\user\Entity\User::load($uid);
    
    if (!$user) {
      $this->messenger()->addError($this->t('User not found.'));
      return $this->redirect('chat_api.admin_users');
    }

    // Get user basic info
    $user_info = [
      'uid' => $user->id(),
      'name' => $user->getAccountName(),
      'email' => $user->getEmail(),
      'created' => $user->getCreatedTime(),
      'access' => $user->getLastAccessedTime(),
      'login' => $user->getLastLoginTime(),
      'status' => $user->isActive(),
      'roles' => $user->getRoles(),
    ];

    // Get comprehensive statistics
    $stats = [
      'friends_count' => $this->getUserFriendCount($uid),
      'pending_sent' => $this->getUserPendingRequestsSent($uid),
      'pending_received' => $this->getUserPendingRequestsReceived($uid),
      'days_registered' => floor((time() - $user->getCreatedTime()) / 86400),
      'last_seen_days' => $user->getLastAccessedTime() > 0 ? 
        floor((time() - $user->getLastAccessedTime()) / 86400) : null,
    ];

    // Get user's friends list
    $friends = $this->getUserFriends($uid, 10);

    // Get pending friend requests (sent and received)
    $pending_sent = $this->getUserPendingRequestsList($uid, 'sent', 5);
    $pending_received = $this->getUserPendingRequestsList($uid, 'received', 5);

    // Get recent activity
    $recent_activity = $this->getUserRecentActivity($uid, 10);

    $build = [
      '#theme' => 'chat_admin_user_detail',
      '#user_info' => $user_info,
      '#stats' => $stats,
      '#friends' => $friends,
      '#pending_sent' => $pending_sent,
      '#pending_received' => $pending_received,
      '#recent_activity' => $recent_activity,
      '#attached' => [
        'library' => ['chat_api/admin', 'chat_api/user-detail'],
      ],
      '#cache' => [
        'contexts' => ['url.path', 'user.permissions'],
        'tags' => ['user:' . $uid],
      ],
    ];
    
    return $build;
  }

  /**
   * Get friend requests sent by user.
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
   * Get friend requests received by user.
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
   * Get user's friends with details.
   */
  private function getUserFriends($uid, $limit = 10) {
    $friends = [];

    // Get friends where user is user_a
    $query_a = $this->database->select('chat_friend', 'cf')
      ->fields('cf', ['user_b', 'created'])
      ->condition('cf.user_a', $uid)
      ->range(0, $limit)
      ->orderBy('cf.created', 'DESC');
    $result_a = $query_a->execute();

    foreach ($result_a as $row) {
      $friend = \Drupal\user\Entity\User::load($row->user_b);
      if ($friend) {
        $friends[] = [
          'uid' => $friend->id(),
          'name' => $friend->getAccountName(),
          'email' => $friend->getEmail(),
          'friend_since' => $row->created,
          'status' => $friend->isActive(),
        ];
      }
    }

    // Get friends where user is user_b
    if (count($friends) < $limit) {
      $query_b = $this->database->select('chat_friend', 'cf')
        ->fields('cf', ['user_a', 'created'])
        ->condition('cf.user_b', $uid)
        ->range(0, $limit - count($friends))
        ->orderBy('cf.created', 'DESC');
      $result_b = $query_b->execute();

      foreach ($result_b as $row) {
        $friend = \Drupal\user\Entity\User::load($row->user_a);
        if ($friend) {
          $friends[] = [
            'uid' => $friend->id(),
            'name' => $friend->getAccountName(),
            'email' => $friend->getEmail(),
            'friend_since' => $row->created,
            'status' => $friend->isActive(),
          ];
        }
      }
    }

    return $friends;
  }

  /**
   * Get pending friend requests list (sent or received).
   */
  private function getUserPendingRequestsList($uid, $type = 'sent', $limit = 5) {
    $requests = [];
    
    $query = $this->database->select('chat_friend_request', 'cfr')
      ->fields('cfr', ['from_user', 'to_user', 'created'])
      ->range(0, $limit)
      ->orderBy('cfr.created', 'DESC');

    if ($type === 'sent') {
      $query->condition('cfr.from_user', $uid);
      $field = 'to_user';
    } else {
      $query->condition('cfr.to_user', $uid);
      $field = 'from_user';
    }

    $result = $query->execute();

    foreach ($result as $row) {
      $other_user = \Drupal\user\Entity\User::load($row->$field);
      if ($other_user) {
        $requests[] = [
          'uid' => $other_user->id(),
          'name' => $other_user->getAccountName(),
          'email' => $other_user->getEmail(),
          'created' => $row->created,
          'type' => $type,
        ];
      }
    }

    return $requests;
  }

  /**
   * Get user's recent activity.
   */
  private function getUserRecentActivity($uid, $limit = 10) {
    $activities = [];

    // Get recent friendships
    $friends_query = $this->database->select('chat_friend', 'cf')
      ->fields('cf')
      ->range(0, 5)
      ->orderBy('cf.created', 'DESC');
    
    $or_group = $friends_query->orConditionGroup()
      ->condition('cf.user_a', $uid)
      ->condition('cf.user_b', $uid);
    $friends_query->condition($or_group);
    
    $friends_result = $friends_query->execute();

    foreach ($friends_result as $row) {
      $friend_uid = ($row->user_a == $uid) ? $row->user_b : $row->user_a;
      $friend = \Drupal\user\Entity\User::load($friend_uid);
      if ($friend) {
        $activities[] = [
          'type' => 'friendship',
          'description' => $this->t('Became friends with @name', ['@name' => $friend->getAccountName()]),
          'timestamp' => $row->created,
          'icon' => 'fa-user-friends',
        ];
      }
    }

    // Get recent friend requests
    $requests_query = $this->database->select('chat_friend_request', 'cfr')
      ->fields('cfr')
      ->range(0, 5)
      ->orderBy('cfr.created', 'DESC');
    
    $or_group = $requests_query->orConditionGroup()
      ->condition('cfr.from_user', $uid)
      ->condition('cfr.to_user', $uid);
    $requests_query->condition($or_group);
    
    $requests_result = $requests_query->execute();

    foreach ($requests_result as $row) {
      $is_sender = ($row->from_user == $uid);
      $other_uid = $is_sender ? $row->to_user : $row->from_user;
      $other_user = \Drupal\user\Entity\User::load($other_uid);
      
      if ($other_user) {
        $activities[] = [
          'type' => 'friend_request',
          'description' => $is_sender ? 
            $this->t('Sent friend request to @name', ['@name' => $other_user->getAccountName()]) :
            $this->t('Received friend request from @name', ['@name' => $other_user->getAccountName()]),
          'timestamp' => $row->created,
          'icon' => 'fa-user-plus',
        ];
      }
    }

    // Sort all activities by timestamp
    usort($activities, function($a, $b) {
      return $b['timestamp'] - $a['timestamp'];
    });

    return array_slice($activities, 0, $limit);
  }

  /**
   * Conversations list page.
   */
  public function conversationsList() {
    // Fetch real-time data from MongoDB via Node.js API
    $node_api_url = 'http://localhost:5001/api/conversations/admin/conversations';
    
    try {
      $response = \Drupal::httpClient()->get($node_api_url);
      $data = json_decode($response->getBody(), TRUE);
      
      if (!$data['success']) {
        throw new \Exception('Failed to fetch conversations from MongoDB');
      }
      
      $conversations = $data['data'] ?? [];
      $stats = $data['stats'] ?? [];
      
      \Drupal::logger('chat_api')->notice('Fetched @count conversations from MongoDB', [
        '@count' => count($conversations),
      ]);
    } catch (\Exception $e) {
      \Drupal::logger('chat_api')->error('Failed to fetch conversations: @error', [
        '@error' => $e->getMessage(),
      ]);
      
      // Fallback to empty data if API fails
      $conversations = [];
      $stats = [
        'totalConversations' => 0,
        'privateConversations' => 0,
        'groupConversations' => 0,
        'activeTodayCount' => 0,
        'totalMessages' => 0,
        'avgParticipants' => 0,
      ];
    }
    
    $build = [
      '#theme' => 'chat_admin_conversations',
      '#conversations' => $conversations,
      '#stats' => $stats,
      '#attached' => [
        'library' => ['chat_api/admin', 'chat_api/admin-tables', 'chat_api/live-updates'],
        'drupalSettings' => [
          'chatAdminLive' => [
            'apiUrl' => $node_api_url,
            'refreshInterval' => 5000, // 5 seconds for real-time feel
            'wsUrl' => 'ws://localhost:5001',
          ],
        ],
      ],
      '#cache' => [
        'max-age' => 0, // No caching - always fresh
        'contexts' => ['user.permissions'],
      ],
    ];
    
    return $build;
  }

  /**
   * View conversation details.
   */
  public function conversationView($conversation_id) {
    // Fetch conversation from database
    $conversation = $this->database->select('chat_conversation', 'cc')
      ->fields('cc')
      ->condition('cc.conversation_id', $conversation_id)
      ->execute()
      ->fetchObject();
    
    if (!$conversation) {
      $this->messenger()->addError($this->t('Conversation not found.'));
      return $this->redirect('chat_api.admin_conversations');
    }
    
    // Get participants
    $participants = $this->database->select('chat_conversation_participant', 'ccp')
      ->fields('ccp', ['user_id', 'joined_at'])
      ->condition('ccp.conversation_id', $conversation_id)
      ->execute()
      ->fetchAll();
    
    // Enrich with user details
    foreach ($participants as $participant) {
      $user = \Drupal\user\Entity\User::load($participant->user_id);
      if ($user) {
        $participant->name = $user->getAccountName();
        $participant->email = $user->getEmail();
        $participant->status = $user->isActive();
      }
    }
    
    $build = [
      '#theme' => 'chat_admin_conversation_view',
      '#conversation' => $conversation,
      '#participants' => $participants,
      '#attached' => [
        'library' => ['chat_api/admin', 'chat_api/user-detail'],
      ],
      '#cache' => [
        'contexts' => ['url.path', 'user.permissions'],
      ],
    ];
    
    return $build;
  }

  /**
   * Delete conversation.
   * Deletes conversation metadata from Drupal database.
   * Note: Messages in MongoDB need to be deleted via Node.js API.
   */
  public function conversationDelete($conversation_id) {
    // Delete from Drupal database
    try {
      // Delete participants first (foreign key)
      $this->database->delete('chat_conversation_participant')
        ->condition('conversation_id', $conversation_id)
        ->execute();
      
      // Delete conversation
      $deleted = $this->database->delete('chat_conversation')
        ->condition('conversation_id', $conversation_id)
        ->execute();
      
      if ($deleted > 0) {
        $this->messenger()->addStatus($this->t('Conversation metadata deleted from Drupal database.'));
        $this->messenger()->addWarning($this->t('Note: Messages in MongoDB need to be deleted separately via Node.js backend API.'));
      } else {
        $this->messenger()->addError($this->t('Conversation not found.'));
      }
    } catch (\Exception $e) {
      $this->messenger()->addError($this->t('Error deleting conversation: @error', ['@error' => $e->getMessage()]));
    }
    
    return new RedirectResponse(Url::fromRoute('chat_api.admin_conversations')->toString());
  }

  /**
   * Friend requests list with full user details.
   */
  public function friendRequestsList() {
    // Query all friend requests with pagination
    $query = $this->database->select('chat_friend_request', 'cfr')
      ->fields('cfr')
      ->orderBy('created', 'DESC')
      ->extend('Drupal\Core\Database\Query\PagerSelectExtender')
      ->limit(50);
    
    $requests = $query->execute()->fetchAll();
    
    // Enrich with user details
    foreach ($requests as $request) {
      // Load sender user
      $from_user = \Drupal\user\Entity\User::load($request->from_user);
      if ($from_user) {
        $request->from_name = $from_user->getAccountName();
        $request->from_email = $from_user->getEmail();
      }
      
      // Load receiver user
      $to_user = \Drupal\user\Entity\User::load($request->to_user);
      if ($to_user) {
        $request->to_name = $to_user->getAccountName();
        $request->to_email = $to_user->getEmail();
      }
      
      // Calculate time ago
      $diff = time() - $request->created;
      if ($diff < 3600) {
        $request->time_ago = floor($diff / 60) . ' minutes ago';
      } elseif ($diff < 86400) {
        $request->time_ago = floor($diff / 3600) . ' hours ago';
      } else {
        $request->time_ago = floor($diff / 86400) . ' days ago';
      }
    }
    
    // Get summary stats
    $stats = [
      'total_requests' => $this->database->select('chat_friend_request', 'cfr')
        ->countQuery()->execute()->fetchField(),
      'pending_requests' => $this->database->select('chat_friend_request', 'cfr')
        ->countQuery()->execute()->fetchField(),
    ];
    
    $build = [
      '#theme' => 'chat_admin_friend_requests',
      '#requests' => $requests,
      '#stats' => $stats,
      '#attached' => [
        'library' => ['chat_api/admin', 'chat_api/admin-tables'],
      ],
      '#cache' => [
        'max-age' => 60,
        'contexts' => ['user.permissions', 'url.query_args'],
      ],
    ];
    
    $build['pager'] = [
      '#type' => 'pager',
    ];
    
    return $build;
  }

  /**
   * Reports & Analytics main page.
   * 
   * TODO: Implement charts, statistics
   */
  public function reports() {
    // TODO: Implement full analytics dashboard
    
    $stats = [
      'total_users' => $this->getTotalUsers(),
      'active_users_today' => $this->getActiveUsersToday(),
      'new_users_this_week' => $this->getNewUsersThisWeek(),
      // TODO: Add more statistics
    ];
    
    $build = [
      '#theme' => 'chat_admin_reports',
      '#stats' => $stats,
      '#attached' => [
        'library' => ['chat_api/admin', 'chat_api/charts'],
      ],
    ];
    
    return $build;
  }

  /**
   * User statistics report.
   * 
   * TODO: Detailed user analytics
   */
  public function reportsUsers() {
    // TODO: Implement user statistics
    
    $build = [
      '#markup' => '<h1>User Statistics</h1><p>TODO: Implement user statistics</p>',
    ];
    
    return $build;
  }

  /**
   * Message statistics report.
   * 
   * TODO: Fetch from Node.js, show charts
   */
  public function reportsMessages() {
    // TODO: Implement message statistics
    
    $build = [
      '#markup' => '<h1>Message Statistics</h1><p>TODO: Fetch data from Node.js backend</p>',
    ];
    
    return $build;
  }

  // ========================================================================
  // Helper methods
  // ========================================================================

  /**
   * Get total number of users.
   */
  private function getTotalUsers() {
    return $this->database->select('users', 'u')
      ->fields('u', ['uid'])
      ->condition('u.uid', 0, '>')
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Get active users today.
   */
  private function getActiveUsersToday() {
    $today = strtotime('today');
    return $this->database->select('users_field_data', 'u')
      ->condition('access', $today, '>=')
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Get total friendships.
   */
  private function getTotalFriendships() {
    return $this->database->select('chat_friend', 'cf')
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Get pending friend requests.
   */
  private function getPendingRequests() {
    return $this->database->select('chat_friend_request', 'cfr')
      ->fields('cfr', ['id'])
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Get new users this week.
   */
  private function getNewUsersThisWeek() {
    $week_ago = strtotime('-7 days');
    return $this->database->select('users_field_data', 'u')
      ->fields('u', ['uid'])
      ->condition('u.created', $week_ago, '>=')
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Get new users today.
   */
  private function getNewUsersToday() {
    $today = strtotime('today');
    return $this->database->select('users_field_data', 'u')
      ->fields('u', ['uid'])
      ->condition('u.created', $today, '>=')
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Get active users this week.
   */
  private function getActiveUsersThisWeek() {
    $week_ago = strtotime('-7 days');
    return $this->database->select('users_field_data', 'u')
      ->fields('u', ['uid'])
      ->condition('u.uid', 0, '>')
      ->condition('u.access', $week_ago, '>=')
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Get blocked users count.
   */
  private function getBlockedUsers() {
    return $this->database->select('users_field_data', 'u')
      ->fields('u', ['uid'])
      ->condition('u.status', 0)
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Get activity trends for last 7 days.
   */
  private function getActivityTrends() {
    $trends = [
      'labels' => [],
      'new_users' => [],
      'active_users' => [],
      'friend_requests' => [],
    ];

    // Get data for last 7 days
    for ($i = 6; $i >= 0; $i--) {
      $date = strtotime("-{$i} days");
      $date_start = strtotime('today', $date);
      $date_end = strtotime('tomorrow', $date) - 1;
      
      $trends['labels'][] = date('D', $date); // Mon, Tue, etc.
      
      // New users per day
      $new_users = $this->database->select('users_field_data', 'u')
        ->fields('u', ['uid'])
        ->condition('u.created', $date_start, '>=')
        ->condition('u.created', $date_end, '<=')
        ->countQuery()
        ->execute()
        ->fetchField();
      $trends['new_users'][] = (int) $new_users;
      
      // Active users per day
      $active_users = $this->database->select('users_field_data', 'u')
        ->fields('u', ['uid'])
        ->condition('u.uid', 0, '>')
        ->condition('u.access', $date_start, '>=')
        ->condition('u.access', $date_end, '<=')
        ->countQuery()
        ->execute()
        ->fetchField();
      $trends['active_users'][] = (int) $active_users;
      
      // Friend requests per day
      $requests = $this->database->select('chat_friend_request', 'cfr')
        ->fields('cfr', ['id'])
        ->condition('cfr.created', $date_start, '>=')
        ->condition('cfr.created', $date_end, '<=')
        ->countQuery()
        ->execute()
        ->fetchField();
      $trends['friend_requests'][] = (int) $requests;
    }

    return $trends;
  }

  /**
   * Get recent users.
   */
  private function getRecentUsers($limit = 5) {
    $query = $this->database->select('users_field_data', 'u')
      ->fields('u', ['uid', 'name', 'mail', 'created', 'status'])
      ->condition('u.uid', 0, '>')
      ->orderBy('u.created', 'DESC')
      ->range(0, $limit);
    
    return $query->execute()->fetchAll();
  }

  /**
   * Get recent friend requests.
   */
  private function getRecentFriendRequests($limit = 5) {
    $query = $this->database->select('chat_friend_request', 'cfr')
      ->fields('cfr')
      ->orderBy('cfr.created', 'DESC')
      ->range(0, $limit);
    
    $requests = $query->execute()->fetchAll();
    
    // Get user names
    foreach ($requests as $request) {
      $sender = $this->database->select('users_field_data', 'u')
        ->fields('u', ['name'])
        ->condition('u.uid', $request->from_user)
        ->execute()
        ->fetchField();
      
      $receiver = $this->database->select('users_field_data', 'u')
        ->fields('u', ['name'])
        ->condition('u.uid', $request->to_user)
        ->execute()
        ->fetchField();
      
      $request->sender_name = $sender ?: 'Unknown';
      $request->receiver_name = $receiver ?: 'Unknown';
    }
    
    return $requests;
  }

}
