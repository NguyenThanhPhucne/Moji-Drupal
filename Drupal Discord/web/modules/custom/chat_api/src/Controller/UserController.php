<?php

namespace Drupal\chat_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Drupal\user\Entity\User;

class UserController extends ControllerBase {

  /**
   * API: /api/users/me
   */
  public function authMe() {
    // Dùng Session Drupal để check login (Cookie)
    $currentUser = \Drupal::currentUser();

    if ($currentUser->isAnonymous()) {
      return new JsonResponse(['message' => 'Unauthorized'], 401);
    }

    $user = User::load($currentUser->id());

    return new JsonResponse([
      'user' => [
        '_id' => $user->id(),
        'uid' => $user->id(),
        'username' => $user->getAccountName(),
        'email' => $user->getEmail(),
        'displayName' => $user->getAccountName(), 
        'avatarUrl' => null, 
        'firstName' => '',
        'lastName' => '',
      ]
    ]);
  }

  /**
   * API: /api/users/search
   */
  public function searchUserByUsername(Request $request) {
    $currentUser = \Drupal::currentUser();
    if ($currentUser->isAnonymous()) {
      return new JsonResponse(['message' => 'Unauthorized'], 401);
    }

    $username = $request->query->get('username');
    if (empty($username)) {
      return new JsonResponse(['message' => 'Missing username'], 400);
    }

    $ids = \Drupal::entityQuery('user')
      ->accessCheck(FALSE)
      ->condition('name', $username)
      ->execute();

    if (empty($ids)) {
      return new JsonResponse(['user' => null]);
    }

    $user = User::load(reset($ids));
    return new JsonResponse([
      'user' => [
        '_id' => $user->id(),
        'displayName' => $user->getAccountName(),
        'username' => $user->getAccountName(),
        'avatarUrl' => null
      ]
    ]);
  }

  /**
   * API: /api/users/uploadAvatar
   */
  public function uploadAvatar(Request $request) {
    return new JsonResponse(['message' => 'Upload service maintenance'], 503);
  }
}
