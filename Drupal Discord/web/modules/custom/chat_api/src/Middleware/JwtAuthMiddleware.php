<?php

namespace Drupal\chat_api\Middleware;

use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\JsonResponse;
use Drupal\user\Entity\User;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

/**
 * JWT Authentication Middleware
 * Giống protectedRoute trong authMiddleware.js
 */
class JwtAuthMiddleware {

  /**
   * Verify JWT token và return user
   * 
   * @param Request $request
   * @return User|JsonResponse
   */
  public static function authenticate(Request $request) {
    try {
      // Lấy token từ Authorization header
      $authHeader = $request->headers->get('Authorization');
      
      if (!$authHeader) {
        return new JsonResponse([
          'message' => 'Không tìm thấy access token'
        ], 401);
      }

      // Extract token (format: "Bearer <token>")
      $parts = explode(' ', $authHeader);
      
      if (count($parts) !== 2 || $parts[0] !== 'Bearer') {
        return new JsonResponse([
          'message' => 'Invalid Authorization header format'
        ], 401);
      }

      $token = $parts[1];

      // Get secret key
      $secret = \Drupal::service('settings')->get('chat_api_access_token_secret');
      
      if (!$secret) {
        \Drupal::logger('chat_api')->error('ACCESS_TOKEN_SECRET not configured');
        return new JsonResponse([
          'message' => 'Server configuration error'
        ], 500);
      }

      // Verify JWT
      try {
        $decoded = JWT::decode($token, new Key($secret, 'HS256'));
      } catch (\Exception $e) {
        return new JsonResponse([
          'message' => 'Access token hết hạn hoặc không đúng'
        ], 403);
      }

      // Load user
      $user = User::load($decoded->userId);

      if (!$user) {
        return new JsonResponse([
          'message' => 'Người dùng không tồn tại'
        ], 404);
      }

      return $user;

    } catch (\Exception $error) {
      \Drupal::logger('chat_api')->error('Lỗi JWT authentication: @error', [
        '@error' => $error->getMessage()
      ]);
      return new JsonResponse([
        'message' => 'Lỗi hệ thống'
      ], 500);
    }
  }
}
