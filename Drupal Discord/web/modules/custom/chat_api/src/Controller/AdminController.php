<?php

namespace Drupal\chat_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Database\Connection;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Drupal\Core\Url;

/**
 * Admin Controller - Bộ não quản lý trang Admin Chat.
 * * Cung cấp giao diện quản trị cho người dùng, cuộc trò chuyện và xem báo cáo.
 */
class AdminController extends ControllerBase {

  /**
   * Kết nối cơ sở dữ liệu.
   *
   * @var \Drupal\Core\Database\Connection
   */
  protected $database;

  /**
   * Khởi tạo đối tượng AdminController.
   *
   * @param \Drupal\Core\Database\Connection $database
   * Kết nối cơ sở dữ liệu.
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
   * Dashboard - Trang tổng quan quản trị chính với số liệu thống kê toàn diện.
   * * Hiển thị số liệu tổng quan, xu hướng hoạt động và tình trạng hệ thống.
   */
  public function dashboard() {
    // Kiểm tra quyền admin
    $current_user = $this->currentUser();
    if (!$current_user->hasPermission('administer chat')) {
      // Hiển thị access denied page thân thiện với link logout
      return [
        '#theme' => 'chat_admin_access_denied',
        '#logout_url' => Url::fromRoute('user.logout'),
        '#back_url' => Url::fromRoute('<front>'),
      ];
    }

    // Lấy số liệu thống kê toàn diện
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

    // Lấy xu hướng hoạt động cho biểu đồ (7 ngày qua)
    $activity_trends = $this->getActivityTrends();

    // Lấy số liệu thống kê gần đây
    $recent_stats = [
      'recent_users' => $this->getRecentUsers(5),
      'recent_requests' => $this->getRecentFriendRequests(5),
    ];

    // Kiểm tra tình trạng hệ thống
    $system_health = [
      'database_status' => 'OK', // Trạng thái DB
      'total_records' => $this->getTotalUsers() + $this->getTotalFriendships(),
    ];
    
    $build = [
      '#theme' => 'chat_admin_dashboard',
      '#stats' => $stats,
      '#activity_trends' => $activity_trends,
      '#recent_stats' => $recent_stats,
      '#system_health' => $system_health,
      '#cache' => [
        'max-age' => 300, // Cache trong 5 phút
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
   * Trang danh sách người dùng - Hiển thị tất cả người dùng với dữ liệu đầy đủ.
   */
  public function usersList() {
    // Lấy tất cả người dùng với thông tin cơ bản
    $query = $this->database->select('users_field_data', 'u')
      ->fields('u', ['uid', 'name', 'mail', 'created', 'access', 'status'])
      ->condition('u.uid', 0, '>') // Bỏ qua user ẩn danh
      ->orderBy('u.created', 'DESC')
      ->extend('Drupal\Core\Database\Query\PagerSelectExtender')
      ->limit(25);
    
    $users = $query->execute()->fetchAll();
    
    // Bổ sung thêm dữ liệu cho từng user (Avatar, Bạn bè, Request...)
    foreach ($users as $user) {
      
      // --- [MỚI] LẤY AVATAR TỪ CLOUDINARY ---
      // Load Entity User đầy đủ để truy cập field_avatar_url
      $userEntity = \Drupal\user\Entity\User::load($user->uid);
      $user->avatarUrl = null; 
      
      // Kiểm tra xem field có tồn tại và có dữ liệu không
      if ($userEntity && $userEntity->hasField('field_avatar_url') && !$userEntity->get('field_avatar_url')->isEmpty()) {
          $user->avatarUrl = $userEntity->get('field_avatar_url')->value;
      }
      // -------------------------------------

      // Lấy số lượng bạn bè
      $user->friend_count = $this->getUserFriendCount($user->uid);
      
      // Lấy số lượng lời mời kết bạn (gửi đi + nhận về)
      $user->pending_requests = $this->getUserPendingRequests($user->uid);
      
      // Tính số ngày kể từ khi đăng ký
      $user->days_registered = floor((time() - $user->created) / 86400);
      
      // Tính số ngày kể từ lần truy cập cuối
      $user->days_since_access = $user->access > 0 ? floor((time() - $user->access) / 86400) : null;
    }
    
    // Lấy số liệu thống kê tóm tắt
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
      '#attached' => [
        'library' => ['chat_api/listing'],
      ],
    ];
    
    $build['pager'] = [
      '#type' => 'pager',
    ];
    
    return $build;
  }
  
  /**
   * Lấy số lượng bạn bè của một người dùng cụ thể.
   */
  private function getUserFriendCount($uid) {
    // Đếm trường hợp người dùng là user_a
    $count_a = $this->database->select('chat_friend', 'cf')
      ->fields('cf', ['id'])
      ->condition('cf.user_a', $uid)
      ->countQuery()
      ->execute()
      ->fetchField();
      
    // Đếm trường hợp người dùng là user_b
    $count_b = $this->database->select('chat_friend', 'cf')
      ->fields('cf', ['id'])
      ->condition('cf.user_b', $uid)
      ->countQuery()
      ->execute()
      ->fetchField();
      
    return (int) $count_a + (int) $count_b;
  }
  
  /**
   * Lấy số lượng lời mời kết bạn đang chờ (gửi đi + nhận về).
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
   * Trang chi tiết người dùng - Hồ sơ người dùng và thống kê toàn diện.
   */
  public function userDetail($uid) {
    // Load user entity
    $user = \Drupal\user\Entity\User::load($uid);
    
    if (!$user) {
      $this->messenger()->addError($this->t('User not found.'));
      return $this->redirect('chat_api.admin_users');
    }

    // --- [MỚI] LẤY AVATAR CHO CHI TIẾT USER ---
    $avatarUrl = null;
    if ($user->hasField('field_avatar_url') && !$user->get('field_avatar_url')->isEmpty()) {
      $avatarUrl = $user->get('field_avatar_url')->value;
    }
    // ------------------------------------------

    // Lấy thông tin cơ bản người dùng
    $user_info = [
      'uid' => $user->id(),
      'name' => $user->getAccountName(),
      'email' => $user->getEmail(),
      'created' => $user->getCreatedTime(),
      'access' => $user->getLastAccessedTime(),
      'login' => $user->getLastLoginTime(),
      'status' => $user->isActive(),
      'roles' => $user->getRoles(),
      'avatarUrl' => $avatarUrl, // Thêm avatarUrl vào mảng info
    ];

    // Lấy thống kê chi tiết
    $stats = [
      'friends_count' => $this->getUserFriendCount($uid),
      'pending_sent' => $this->getUserPendingRequestsSent($uid),
      'pending_received' => $this->getUserPendingRequestsReceived($uid),
      'days_registered' => floor((time() - $user->getCreatedTime()) / 86400),
      'last_seen_days' => $user->getLastAccessedTime() > 0 ? 
        floor((time() - $user->getLastAccessedTime()) / 86400) : null,
    ];

    // Lấy danh sách bạn bè của người dùng
    $friends = $this->getUserFriends($uid, 10);

    // Lấy các lời mời kết bạn (gửi đi và nhận về)
    $pending_sent = $this->getUserPendingRequestsList($uid, 'sent', 5);
    $pending_received = $this->getUserPendingRequestsList($uid, 'received', 5);

    // Lấy hoạt động gần đây
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
        'library' => ['chat_api/listing', 'chat_api/user-detail'],
      ],
    ];
    
    return $build;
  }

  /**
   * Lấy số lời mời kết bạn ĐÃ GỬI bởi người dùng.
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
   * Lấy số lời mời kết bạn ĐÃ NHẬN bởi người dùng.
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
   * Lấy danh sách bạn bè của người dùng với chi tiết.
   */
  private function getUserFriends($uid, $limit = 10) {
    $friends = [];

    // Lấy bạn bè khi người dùng là user_a
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

    // Lấy bạn bè khi người dùng là user_b (nếu chưa đủ limit)
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
   * Lấy danh sách lời mời kết bạn (đã gửi hoặc đã nhận).
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
   * Lấy hoạt động gần đây của người dùng.
   */
  private function getUserRecentActivity($uid, $limit = 10) {
    $activities = [];

    // Lấy các kết bạn gần đây
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
          'description' => $this->t('Đã kết bạn với @name', ['@name' => $friend->getAccountName()]),
          'timestamp' => $row->created,
          'icon' => 'fa-user-friends',
        ];
      }
    }

    // Lấy các lời mời kết bạn gần đây
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
            $this->t('Đã gửi lời mời đến @name', ['@name' => $other_user->getAccountName()]) :
            $this->t('Nhận lời mời từ @name', ['@name' => $other_user->getAccountName()]),
          'timestamp' => $row->created,
          'icon' => 'fa-user-plus',
        ];
      }
    }

    // Sắp xếp tất cả hoạt động theo thời gian
    usort($activities, function($a, $b) {
      return $b['timestamp'] - $a['timestamp'];
    });

    return array_slice($activities, 0, $limit);
  }

  /**
   * Trang danh sách cuộc trò chuyện.
   */
  public function conversationsList() {
    // Lấy dữ liệu thời gian thực từ MongoDB qua API Node.js
    $node_api_url = 'http://localhost:5001/api/conversations/admin/conversations';
    
    \Drupal::logger('chat_api')->info('📊 [AdminController] Đang lấy dữ liệu từ: @url', [
      '@url' => $node_api_url,
    ]);
    
    try {
      $response = \Drupal::httpClient()->get($node_api_url, [
        'timeout' => 5,
      ]);
      
      $statusCode = $response->getStatusCode();
      $body = $response->getBody()->getContents();
      $data = json_decode($body, TRUE);
      
      \Drupal::logger('chat_api')->info('📊 [AdminController] API Response: @status | Data: @data', [
        '@status' => $statusCode,
        '@data' => print_r($data, TRUE),
      ]);
      
      if (!$data['success']) {
        throw new \Exception('Không thể lấy cuộc trò chuyện từ MongoDB');
      }
      
      $conversations = $data['data'] ?? [];
      $api_stats = $data['stats'] ?? [];
      
      // Chuyển đổi API stats (camelCase) sang định dạng template (snake_case)
      $stats = [
        'total_conversations' => $api_stats['totalConversations'] ?? 0,
        'private_conversations' => $api_stats['privateConversations'] ?? 0,
        'group_conversations' => $api_stats['groupConversations'] ?? 0,
        'active_today' => $api_stats['activeTodayCount'] ?? 0,
        'total_messages' => $api_stats['totalMessages'] ?? 0,
        'avg_participants' => $api_stats['avgParticipants'] ?? 0,
      ];
      
      \Drupal::logger('chat_api')->notice('✅ Đã lấy @count cuộc trò chuyện từ MongoDB', [
        '@count' => count($conversations),
      ]);
    } catch (\Exception $e) {
      \Drupal::logger('chat_api')->error('❌ Lỗi khi lấy cuộc trò chuyện: @error', [
        '@error' => $e->getMessage(),
      ]);

      // Show error to user
      $this->messenger()->addError($this->t('Lỗi khi kết nối tới API: @error', [
        '@error' => $e->getMessage(),
      ]));
      
      // Fallback về dữ liệu rỗng nếu API lỗi
      $conversations = [];
      $stats = [
        'total_conversations' => 0,
        'private_conversations' => 0,
        'group_conversations' => 0,
        'active_today' => 0,
        'total_messages' => 0,
        'avg_participants' => 0,
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
            'refreshInterval' => 5000, // 5 giây làm mới để có cảm giác thời gian thực
            'wsUrl' => 'ws://localhost:5001',
            'debug' => [
              'initialConversationsCount' => count($conversations),
              'initialParticipantsInFirstConv' => count($conversations[0]['participants'] ?? []) ?? 0,
              'sampleParticipants' => $conversations[0]['participants'] ?? [],
            ],
          ],
        ],
      ],
      '#cache' => [
        'max-age' => 0, // Không cache - luôn tươi mới
        'contexts' => ['user.permissions'],
      ],
    ];
    
    return $build;
  }

  /**
   * Xem chi tiết cuộc trò chuyện.
   */
  public function conversationView($conversation_id) {
    // Lấy cuộc trò chuyện từ MongoDB qua API Node.js
    $node_api_url = 'http://localhost:5001/api/conversations/admin/' . $conversation_id;

    try {
      $response = \Drupal::httpClient()->get($node_api_url, [
        'timeout' => 5,
      ]);

      $statusCode = $response->getStatusCode();
      $body = $response->getBody()->getContents();
      $data = json_decode($body, TRUE);

      if ($statusCode !== 200 || !$data['success']) {
        $this->messenger()->addError($this->t('Không tìm thấy cuộc trò chuyện.'));
        return $this->redirect('chat_api.admin_conversations');
      }

      $conversation = $data['data']['conversation'] ?? NULL;
      $messages = $data['data']['messages'] ?? [];

      if (!$conversation) {
        $this->messenger()->addError($this->t('Không tìm thấy cuộc trò chuyện.'));
        return $this->redirect('chat_api.admin_conversations');
      }

      $build = [
        '#theme' => 'chat_admin_conversation_view',
        '#conversation' => $conversation,
        '#messages' => $messages,
        '#conversation_id' => $conversation_id,
        '#attached' => [
          'library' => ['chat_api/admin', 'chat_api/admin-conversation-view'],
          'drupalSettings' => [
            'chatAdminConversation' => [
              'conversationId' => $conversation_id,
              'apiUrl' => $node_api_url,
            ],
          ],
        ],
        '#cache' => [
          'max-age' => 0, // No cache - always fresh
          'contexts' => ['url.path', 'user.permissions'],
        ],
      ];

      return $build;
    } catch (\Exception $e) {
      $this->messenger()->addError($this->t('Lỗi khi lấy dữ liệu cuộc trò chuyện: @error', [
        '@error' => $e->getMessage(),
      ]));
      return $this->redirect('chat_api.admin_conversations');
    }
  }

  /**
   * Xóa cuộc trò chuyện.
   * Xóa từ MongoDB qua API Backend Node.js.
   */
  public function conversationDelete($conversation_id) {
    // Check if this is an AJAX request
    $request = \Drupal::request();
    $is_ajax = $request->getMethod() === 'DELETE' || 
               $request->headers->get('X-Requested-With') === 'XMLHttpRequest' ||
               !empty($request->query->get('ajax'));
    
    $node_api_url = 'http://localhost:5001/api/conversations/admin/' . $conversation_id;

    try {
      $response = \Drupal::httpClient()->delete($node_api_url, [
        'timeout' => 5,
      ]);

      $statusCode = $response->getStatusCode();
      $body = $response->getBody()->getContents();
      $data = json_decode($body, TRUE);

      if ($statusCode === 200 && $data['success']) {
        if ($is_ajax) {
          return new JsonResponse(['success' => true, 'message' => 'Conversation deleted successfully']);
        }
        $this->messenger()->addStatus($this->t('Cuộc trò chuyện đã bị xóa thành công.'));
      } else {
        if ($is_ajax) {
          return new JsonResponse(['success' => false, 'error' => 'Failed to delete conversation'], 400);
        }
        $this->messenger()->addError($this->t('Không tìm thấy cuộc trò chuyện để xóa.'));
      }
    } catch (\Exception $e) {
      if ($is_ajax) {
        return new JsonResponse(['success' => false, 'error' => $e->getMessage()], 500);
      }
      $this->messenger()->addError($this->t('Lỗi khi xóa cuộc trò chuyện: @error', [
        '@error' => $e->getMessage(),
      ]));
    }

    return new RedirectResponse(Url::fromRoute('chat_api.admin_conversations')->toString());
  }

  /**
   * Trang danh sách bạn bè - Hiển thị tất cả quan hệ bạn bè.
   */
  public function friendsList() {
    // Query tất cả bạn bè có phân trang
    $query = $this->database->select('chat_friend', 'cf')
      ->fields('cf')
      ->orderBy('cf.created', 'DESC')
      ->extend('Drupal\Core\Database\Query\PagerSelectExtender')
      ->limit(50);
    
    $friendships = $query->execute()->fetchAll();
    
    // Bổ sung chi tiết người dùng
    foreach ($friendships as $friendship) {
      // Load user A
      $user_a = \Drupal\user\Entity\User::load($friendship->user_a);
      if ($user_a) {
        $friendship->user_a_name = $user_a->getAccountName();
        $friendship->user_a_email = $user_a->getEmail();
      }
      
      // Load user B
      $user_b = \Drupal\user\Entity\User::load($friendship->user_b);
      if ($user_b) {
        $friendship->user_b_name = $user_b->getAccountName();
        $friendship->user_b_email = $user_b->getEmail();
      }
      
      // Tính thời gian trôi qua
      $diff = time() - $friendship->created;
      if ($diff < 3600) {
        $friendship->time_ago = floor($diff / 60) . ' phút trước';
      } elseif ($diff < 86400) {
        $friendship->time_ago = floor($diff / 3600) . ' giờ trước';
      } else {
        $friendship->time_ago = floor($diff / 86400) . ' ngày trước';
      }
    }
    
    // Lấy thống kê tóm tắt
    $stats = [
      'total_friends' => $this->getTotalFriendships(),
      'new_friendships_today' => $this->getNewFriendshipsToday(),
      'new_friendships_week' => $this->getNewFriendshipsThisWeek(),
      'avg_friends_per_user' => $this->getAverageFriendsPerUser(),
    ];
    
    $build = [
      '#theme' => 'chat_admin_friends',
      '#friendships' => $friendships,
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
   * Danh sách lời mời kết bạn với đầy đủ chi tiết người dùng.
   */
  public function friendRequestsList() {
    // Query tất cả lời mời kết bạn có phân trang
    $query = $this->database->select('chat_friend_request', 'cfr')
      ->fields('cfr')
      ->orderBy('created', 'DESC')
      ->extend('Drupal\Core\Database\Query\PagerSelectExtender')
      ->limit(50);
    
    $requests = $query->execute()->fetchAll();
    
    // Bổ sung chi tiết người dùng
    foreach ($requests as $request) {
      // Load người gửi
      $from_user = \Drupal\user\Entity\User::load($request->from_user);
      if ($from_user) {
        $request->from_name = $from_user->getAccountName();
        $request->from_email = $from_user->getEmail();
      }
      
      // Load người nhận
      $to_user = \Drupal\user\Entity\User::load($request->to_user);
      if ($to_user) {
        $request->to_name = $to_user->getAccountName();
        $request->to_email = $to_user->getEmail();
      }
      
      // Tính thời gian trôi qua
      $diff = time() - $request->created;
      if ($diff < 3600) {
        $request->time_ago = floor($diff / 60) . ' phút trước';
      } elseif ($diff < 86400) {
        $request->time_ago = floor($diff / 3600) . ' giờ trước';
      } else {
        $request->time_ago = floor($diff / 86400) . ' ngày trước';
      }
    }
    
    // Lấy thống kê tóm tắt
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
   * Trang chính Báo cáo & Phân tích.
   * * TODO: Triển khai biểu đồ, thống kê chi tiết
   */
  public function reports() {
    // TODO: Triển khai dashboard phân tích đầy đủ
    
    $stats = [
      'total_users' => $this->getTotalUsers(),
      'active_users_today' => $this->getActiveUsersToday(),
      'new_users_this_week' => $this->getNewUsersThisWeek(),
      // TODO: Thêm nhiều thống kê hơn
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
   * Báo cáo thống kê người dùng.
   * * TODO: Phân tích người dùng chi tiết
   */
  public function reportsUsers() {
    // TODO: Triển khai thống kê người dùng
    
    $build = [
      '#markup' => '<h1>Thống kê Người dùng</h1><p>TODO: Triển khai thống kê người dùng</p>',
    ];
    
    return $build;
  }

  /**
   * Báo cáo thống kê tin nhắn.
   * * TODO: Lấy từ Node.js, hiển thị biểu đồ
   */
  public function reportsMessages() {
    // TODO: Triển khai thống kê tin nhắn
    
    $build = [
      '#markup' => '<h1>Thống kê Tin nhắn</h1><p>TODO: Lấy dữ liệu từ backend Node.js</p>',
    ];
    
    return $build;
  }

  // ========================================================================
  // Các phương thức Helper (Hỗ trợ)
  // ========================================================================

  /**
   * Lấy tổng số người dùng.
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
   * Lấy số người dùng hoạt động hôm nay.
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
   * Lấy tổng số tình bạn.
   */
  private function getTotalFriendships() {
    return $this->database->select('chat_friend', 'cf')
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Lấy số lời mời kết bạn đang chờ.
   */
  private function getPendingRequests() {
    return $this->database->select('chat_friend_request', 'cfr')
      ->fields('cfr', ['id'])
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Lấy số người dùng mới trong tuần này.
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
   * Lấy số người dùng mới hôm nay.
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
   * Lấy số người dùng hoạt động trong tuần này.
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
   * Lấy số người dùng bị chặn.
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
   * Lấy xu hướng hoạt động trong 7 ngày qua.
   */
  private function getActivityTrends() {
    $trends = [
      'labels' => [],
      'new_users' => [],
      'active_users' => [],
      'friend_requests' => [],
    ];

    // Lấy dữ liệu cho 7 ngày qua
    for ($i = 6; $i >= 0; $i--) {
      $date = strtotime("-{$i} days");
      $date_start = strtotime('today', $date);
      $date_end = strtotime('tomorrow', $date) - 1;
      
      $trends['labels'][] = date('D', $date); // Mon, Tue, etc.
      
      // Người dùng mới mỗi ngày
      $new_users = $this->database->select('users_field_data', 'u')
        ->fields('u', ['uid'])
        ->condition('u.created', $date_start, '>=')
        ->condition('u.created', $date_end, '<=')
        ->countQuery()
        ->execute()
        ->fetchField();
      $trends['new_users'][] = (int) $new_users;
      
      // Người dùng hoạt động mỗi ngày
      $active_users = $this->database->select('users_field_data', 'u')
        ->fields('u', ['uid'])
        ->condition('u.uid', 0, '>')
        ->condition('u.access', $date_start, '>=')
        ->condition('u.access', $date_end, '<=')
        ->countQuery()
        ->execute()
        ->fetchField();
      $trends['active_users'][] = (int) $active_users;
      
      // Lời mời kết bạn mỗi ngày
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
   * Lấy người dùng gần đây.
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
   * Lấy lời mời kết bạn gần đây.
   */
  private function getRecentFriendRequests($limit = 5) {
    $query = $this->database->select('chat_friend_request', 'cfr')
      ->fields('cfr')
      ->orderBy('cfr.created', 'DESC')
      ->range(0, $limit);
    
    $requests = $query->execute()->fetchAll();
    
    // Lấy tên người dùng
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

  /**
   * Lấy số kết bạn mới hôm nay.
   */
  private function getNewFriendshipsToday() {
    $today = strtotime('today');
    return $this->database->select('chat_friend', 'cf')
      ->fields('cf', ['id'])
      ->condition('cf.created', $today, '>=')
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Lấy số kết bạn mới tuần này.
   */
  private function getNewFriendshipsThisWeek() {
    $week_ago = strtotime('-7 days');
    return $this->database->select('chat_friend', 'cf')
      ->fields('cf', ['id'])
      ->condition('cf.created', $week_ago, '>=')
      ->countQuery()
      ->execute()
      ->fetchField();
  }

  /**
   * Lấy trung bình số bạn bè mỗi người dùng.
   */
  private function getAverageFriendsPerUser() {
    $total_users = (int) $this->getTotalUsers();
    if ($total_users === 0) {
      return 0;
    }
    
    $total_friendships = (int) $this->getTotalFriendships();
    // Mỗi tình bạn được tính 2 lần (user_a + user_b), nên tổng số kết nối là friendship * 2
    $total_friend_connections = $total_friendships * 2;
    
    return round($total_friend_connections / $total_users, 2);
  }

}