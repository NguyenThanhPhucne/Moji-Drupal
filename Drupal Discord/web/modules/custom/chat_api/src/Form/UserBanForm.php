<?php

namespace Drupal\chat_api\Form;

use Drupal\Core\Form\ConfirmFormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Url;
use Drupal\user\Entity\User;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Drupal\Core\Database\Connection;

/**
 * Provides a confirmation form before banning/unbanning a user.
 */
class UserBanForm extends ConfirmFormBase {

  /**
   * The user ID.
   *
   * @var int
   */
  protected $uid;

  /**
   * The action (ban or unban).
   *
   * @var string
   */
  protected $action;

  /**
   * The database connection.
   *
   * @var \Drupal\Core\Database\Connection
   */
  protected $database;

  /**
   * Constructs a UserBanForm object.
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
   * {@inheritdoc}
   */
  public function getFormId() {
    return 'chat_api_user_ban_form';
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state, $uid = NULL) {
    $this->uid = $uid;
    
    // Get action from route
    $route_match = \Drupal::routeMatch();
    $route_name = $route_match->getRouteName();
    $this->action = ($route_name === 'chat_api.admin_user_unban') ? 'unban' : 'ban';

    $user = User::load($uid);
    if (!$user) {
      $this->messenger()->addError($this->t('User not found.'));
      return $this->redirect('chat_api.admin_users');
    }

    // Fetch user statistics
    $friends_count = $this->database->query(
      "SELECT COUNT(*) FROM {chat_friend} WHERE user_a = :uid OR user_b = :uid",
      [':uid' => $uid]
    )->fetchField();

    $pending_sent = $this->database->query(
      "SELECT COUNT(*) FROM {chat_friend_request} WHERE from_user = :uid",
      [':uid' => $uid]
    )->fetchField();

    $pending_received = $this->database->query(
      "SELECT COUNT(*) FROM {chat_friend_request} WHERE to_user = :uid",
      [':uid' => $uid]
    )->fetchField();

    $pending_requests = $pending_sent + $pending_received;

    $created_timestamp = $user->getCreatedTime();
    $current_timestamp = \Drupal::time()->getRequestTime();
    $days_registered = floor(($current_timestamp - $created_timestamp) / 86400);

    // Attach Font Awesome CDN
    $form['#attached']['library'][] = 'chat_api/ban-confirm';
    
    // Pass user info to template
    $form['#theme'] = 'chat_admin_user_ban';
    $form['#user_info'] = [
      'uid' => $uid,
      'name' => $user->getAccountName(),
      'email' => $user->getEmail(),
      'friends_count' => $friends_count,
      'pending_requests' => $pending_requests,
      'days_registered' => $days_registered,
      'avatar_letter' => strtoupper(substr($user->getAccountName(), 0, 1)),
    ];
    $form['#action'] = $action;

    return parent::buildForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function getQuestion() {
    $user = User::load($this->uid);
    if ($this->action === 'ban') {
      return $this->t('Are you sure you want to block @name?', ['@name' => $user->getAccountName()]);
    }
    return $this->t('Are you sure you want to unblock @name?', ['@name' => $user->getAccountName()]);
  }

  /**
   * {@inheritdoc}
   */
  public function getCancelUrl() {
    return new Url('chat_api.admin_user_detail', ['uid' => $this->uid]);
  }

  /**
   * {@inheritdoc}
   */
  public function getDescription() {
    if ($this->action === 'ban') {
      return $this->t('This will prevent the user from logging in and accessing the chat system. This action can be reversed.');
    }
    return $this->t('This will restore the user\'s access to the chat system.');
  }

  /**
   * {@inheritdoc}
   */
  public function getConfirmText() {
    return $this->action === 'ban' ? $this->t('Block User') : $this->t('Unblock User');
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state) {
    $user = User::load($this->uid);

    if ($this->action === 'ban' && $user->isActive()) {
      $user->block();
      $user->save();

      // Log the action
      \Drupal::logger('chat_api')->notice(
        'User @uid (@name) blocked by admin @admin',
        [
          '@uid' => $this->uid,
          '@name' => $user->getAccountName(),
          '@admin' => $this->currentUser()->id(),
        ]
      );

      $this->messenger()->addStatus(
        $this->t('User @name has been blocked successfully.', ['@name' => $user->getAccountName()])
      );
    }
    elseif ($this->action === 'unban' && $user->isBlocked()) {
      $user->activate();
      $user->save();

      // Log the action
      \Drupal::logger('chat_api')->notice(
        'User @uid (@name) unblocked by admin @admin',
        [
          '@uid' => $this->uid,
          '@name' => $user->getAccountName(),
          '@admin' => $this->currentUser()->id(),
        ]
      );

      $this->messenger()->addStatus(
        $this->t('User @name has been unblocked successfully.', ['@name' => $user->getAccountName()])
      );
    }

    $form_state->setRedirect('chat_api.admin_user_detail', ['uid' => $this->uid]);
  }

}
