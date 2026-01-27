<?php

namespace Drupal\chat_api\Form;

use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;

/**
 * Configure chat system settings.
 */
class ChatSettingsForm extends ConfigFormBase {

  /**
   * {@inheritdoc}
   */
  protected function getEditableConfigNames() {
    return ['chat_api.settings'];
  }

  /**
   * {@inheritdoc}
   */
  public function getFormId() {
    return 'chat_api_settings_form';
  }

  /**
   * {@inheritdoc}
   */
  public function buildForm(array $form, FormStateInterface $form_state) {
    $config = $this->config('chat_api.settings');

    // Upload settings
    $form['upload'] = [
      '#type' => 'details',
      '#title' => $this->t('Upload Settings'),
      '#open' => TRUE,
    ];

    $form['upload']['max_file_size'] = [
      '#type' => 'number',
      '#title' => $this->t('Max file size (MB)'),
      '#default_value' => $config->get('max_file_size') ?? 5,
      '#min' => 1,
      '#max' => 100,
      '#description' => $this->t('Maximum file size for uploads in megabytes.'),
    ];

    $form['upload']['allowed_extensions'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Allowed file extensions'),
      '#default_value' => $config->get('allowed_extensions') ?? 'jpg jpeg png gif webp',
      '#description' => $this->t('Separate extensions with spaces. Example: jpg jpeg png gif'),
    ];

    // Message settings
    $form['messages'] = [
      '#type' => 'details',
      '#title' => $this->t('Message Settings'),
      '#open' => TRUE,
    ];

    $form['messages']['max_message_length'] = [
      '#type' => 'number',
      '#title' => $this->t('Max message length'),
      '#default_value' => $config->get('max_message_length') ?? 5000,
      '#min' => 100,
      '#max' => 10000,
      '#description' => $this->t('Maximum number of characters per message.'),
    ];

    $form['messages']['message_retention_days'] = [
      '#type' => 'number',
      '#title' => $this->t('Message retention (days)'),
      '#default_value' => $config->get('message_retention_days') ?? 365,
      '#min' => 0,
      '#description' => $this->t('Delete messages older than this many days. Set to 0 to never delete.'),
    ];

    $form['messages']['enable_message_editing'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable message editing'),
      '#default_value' => $config->get('enable_message_editing') ?? TRUE,
      '#description' => $this->t('Allow users to edit their sent messages.'),
    ];

    $form['messages']['enable_message_deletion'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable message deletion'),
      '#default_value' => $config->get('enable_message_deletion') ?? TRUE,
      '#description' => $this->t('Allow users to delete their sent messages.'),
    ];

    // Rate limiting
    $form['rate_limiting'] = [
      '#type' => 'details',
      '#title' => $this->t('Rate Limiting'),
      '#open' => TRUE,
    ];

    $form['rate_limiting']['messages_per_minute'] = [
      '#type' => 'number',
      '#title' => $this->t('Max messages per minute'),
      '#default_value' => $config->get('messages_per_minute') ?? 60,
      '#min' => 10,
      '#max' => 300,
      '#description' => $this->t('Maximum number of messages a user can send per minute.'),
    ];

    $form['rate_limiting']['friend_requests_per_day'] = [
      '#type' => 'number',
      '#title' => $this->t('Max friend requests per day'),
      '#default_value' => $config->get('friend_requests_per_day') ?? 50,
      '#min' => 5,
      '#max' => 200,
      '#description' => $this->t('Maximum number of friend requests a user can send per day.'),
    ];

    // Security settings
    $form['security'] = [
      '#type' => 'details',
      '#title' => $this->t('Security Settings'),
      '#open' => FALSE,
    ];

    $form['security']['require_email_verification'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Require email verification'),
      '#default_value' => $config->get('require_email_verification') ?? FALSE,
      '#description' => $this->t('Require users to verify their email before using chat.'),
    ];

    $form['security']['enable_profanity_filter'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Enable profanity filter'),
      '#default_value' => $config->get('enable_profanity_filter') ?? FALSE,
      '#description' => $this->t('Filter inappropriate language in messages.'),
    ];

    // Node.js backend settings
    $form['backend'] = [
      '#type' => 'details',
      '#title' => $this->t('Backend Settings'),
      '#open' => FALSE,
    ];

    $form['backend']['nodejs_backend_url'] = [
      '#type' => 'textfield',
      '#title' => $this->t('Node.js Backend URL'),
      '#default_value' => $config->get('nodejs_backend_url') ?? 'http://localhost:5001',
      '#description' => $this->t('URL of the Node.js backend server for messaging.'),
      '#required' => TRUE,
    ];

    $form['backend']['mongodb_connection_string'] = [
      '#type' => 'textfield',
      '#title' => $this->t('MongoDB Connection String'),
      '#default_value' => $config->get('mongodb_connection_string') ?? 'mongodb://localhost:27017/moji',
      '#description' => $this->t('MongoDB connection string for message storage.'),
    ];

    return parent::buildForm($form, $form_state);
  }

  /**
   * {@inheritdoc}
   */
  public function validateForm(array &$form, FormStateInterface $form_state) {
    parent::validateForm($form, $form_state);

    // Validate Node.js backend URL
    $nodejs_url = $form_state->getValue('nodejs_backend_url');
    if (!filter_var($nodejs_url, FILTER_VALIDATE_URL)) {
      $form_state->setErrorByName('nodejs_backend_url', $this->t('Please enter a valid URL.'));
    }

    // TODO: Add more validation if needed
  }

  /**
   * {@inheritdoc}
   */
  public function submitForm(array &$form, FormStateInterface $form_state) {
    $this->config('chat_api.settings')
      // Upload settings
      ->set('max_file_size', $form_state->getValue('max_file_size'))
      ->set('allowed_extensions', $form_state->getValue('allowed_extensions'))
      // Message settings
      ->set('max_message_length', $form_state->getValue('max_message_length'))
      ->set('message_retention_days', $form_state->getValue('message_retention_days'))
      ->set('enable_message_editing', $form_state->getValue('enable_message_editing'))
      ->set('enable_message_deletion', $form_state->getValue('enable_message_deletion'))
      // Rate limiting
      ->set('messages_per_minute', $form_state->getValue('messages_per_minute'))
      ->set('friend_requests_per_day', $form_state->getValue('friend_requests_per_day'))
      // Security
      ->set('require_email_verification', $form_state->getValue('require_email_verification'))
      ->set('enable_profanity_filter', $form_state->getValue('enable_profanity_filter'))
      // Backend
      ->set('nodejs_backend_url', $form_state->getValue('nodejs_backend_url'))
      ->set('mongodb_connection_string', $form_state->getValue('mongodb_connection_string'))
      ->save();

    parent::submitForm($form, $form_state);

    // TODO: Sync settings to Node.js backend
  }

}
