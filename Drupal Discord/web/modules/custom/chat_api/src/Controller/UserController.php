<?php

namespace Drupal\chat_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Drupal\user\Entity\User;

/**
 * Controller quản lý thông tin người dùng (User Profile).
 */
class UserController extends ControllerBase {

  /**
   * API: Lấy thông tin bản thân (GET /api/users/me)
   * React sẽ gọi API này ngay sau khi login (hoặc F5) để lấy thông tin user + avatar.
   */
  public function authMe() {
    // 1. Lấy user hiện tại đang đăng nhập (từ Session/Cookie Drupal)
    $currentUser = \Drupal::currentUser();

    // 2. Kiểm tra nếu chưa đăng nhập thì trả về lỗi 401
    if ($currentUser->isAnonymous()) {
      return new JsonResponse(['message' => 'Bạn chưa đăng nhập'], 401);
    }

    // 3. Load toàn bộ entity User từ Database (để lấy các field tùy chỉnh)
    $user = User::load($currentUser->id());

    // 4. Lấy link Avatar từ field 'field_avatar_url' (nếu có)
    $avatar = null;
    // Kiểm tra xem cột này có tồn tại và có dữ liệu không
    if ($user->hasField('field_avatar_url') && !$user->get('field_avatar_url')->isEmpty()) {
      $avatar = $user->get('field_avatar_url')->value;
    }

    // 5. Lấy tên hiển thị (Display Name)
    // Ưu tiên lấy field_display_name, nếu chưa đặt thì lấy tên đăng nhập (Account Name)
    $displayName = $user->getAccountName();
    if ($user->hasField('field_display_name') && !$user->get('field_display_name')->isEmpty()) {
      $displayName = $user->get('field_display_name')->value;
    }

    // 6. Trả về JSON chuẩn cho React
    return new JsonResponse([
      'user' => [
        '_id' => $user->id(), // ID dạng số (1, 2, 3...) dùng cho Drupal
        'uid' => $user->id(), // (Dự phòng)
        'username' => $user->getAccountName(), // Tên đăng nhập (duy nhất)
        'email' => $user->getEmail(),
        'displayName' => $displayName, // Tên hiển thị đẹp
        'avatarUrl' => $avatar, // Link ảnh Cloudinary (quan trọng!)
      ]
    ]);
  }

  /**
   * [MỚI] API: Cập nhật Avatar (POST /api/users/avatar)
   * React gửi link ảnh Cloudinary lên -> Drupal lưu vào Database.
   */
  public function updateAvatar(Request $request) {
    // 1. Kiểm tra quyền đăng nhập
    $currentUser = \Drupal::currentUser();
    if ($currentUser->isAnonymous()) {
      return new JsonResponse(['message' => 'Bạn chưa đăng nhập'], 401);
    }

    // 2. Lấy dữ liệu JSON gửi lên từ React
    // React gửi body dạng: { "avatarUrl": "https://res.cloudinary.com/..." }
    $data = json_decode($request->getContent(), TRUE);
    $url = $data['avatarUrl'] ?? '';

    // 3. Validate dữ liệu
    if (empty($url)) {
      return new JsonResponse(['message' => 'Không tìm thấy link ảnh (avatarUrl)'], 400);
    }

    try {
      // 4. Load User Entity để chỉnh sửa
      $user = User::load($currentUser->id());
      
      // 5. Lưu link vào trường 'field_avatar_url'
      // Kiểm tra field có tồn tại không (do file install tạo ra)
      if ($user->hasField('field_avatar_url')) {
        $user->set('field_avatar_url', $url);
        $user->save(); // Lưu thay đổi vào MySQL
        
        return new JsonResponse([
          'message' => 'Cập nhật Avatar thành công',
          'avatarUrl' => $url
        ]);
      } else {
        // Trường hợp chưa chạy update database nên thiếu cột
        return new JsonResponse(['message' => 'Lỗi DB: Chưa có cột field_avatar_url. Hãy chạy update module.'], 500);
      }

    } catch (\Exception $e) {
      return new JsonResponse(['message' => 'Lỗi hệ thống: ' . $e->getMessage()], 500);
    }
  }

  /**
   * API: Tìm kiếm người dùng (GET /api/users/search?username=abc)
   * Dùng để tìm bạn bè và kết bạn.
   */
  public function searchUserByUsername(Request $request) {
    // 1. Kiểm tra đăng nhập
    $currentUser = \Drupal::currentUser();
    if ($currentUser->isAnonymous()) {
      return new JsonResponse(['message' => 'Unauthorized'], 401);
    }

    // 2. Lấy từ khóa tìm kiếm từ URL
    $username = $request->query->get('username');
    if (empty($username)) {
      return new JsonResponse(['message' => 'Vui lòng nhập tên cần tìm'], 400);
    }

    // 3. Query tìm User trong Database
    // Tìm chính xác theo tên đăng nhập (name)
    $ids = \Drupal::entityQuery('user')
      ->accessCheck(FALSE) // Bỏ qua check quyền để tìm được mọi user
      ->condition('name', $username)
      ->execute();

    // Nếu không tìm thấy ai
    if (empty($ids)) {
      return new JsonResponse(['user' => null]);
    }

    // 4. Load thông tin người tìm được (người đầu tiên)
    $user = User::load(reset($ids));
    
    // Lấy thông tin chi tiết để hiển thị
    $avatar = $user->hasField('field_avatar_url') ? $user->get('field_avatar_url')->value : null;
    $displayName = $user->hasField('field_display_name') ? $user->get('field_display_name')->value : $user->getAccountName();

    return new JsonResponse([
      'user' => [
        '_id' => $user->id(),
        'username' => $user->getAccountName(),
        'displayName' => $displayName,
        'avatarUrl' => $avatar // Trả về avatar để hiển thị khi tìm kiếm
      ]
    ]);
  }
}