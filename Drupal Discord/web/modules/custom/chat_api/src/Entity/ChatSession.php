<?php

namespace Drupal\chat_api\Entity;

use Drupal\Core\Entity\ContentEntityBase;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Field\BaseFieldDefinition;

/**
 * Defines the Chat Session entity.
 *
 * Tương đương với MongoDB Session model trong code cũ.
 *
 * @ContentEntityType(
 *   id = "chat_session",
 *   label = @Translation("Chat Session"),
 *   base_table = "chat_session",
 *   entity_keys = {
 *     "id" = "id",
 *     "uuid" = "uuid",
 *   },
 *   handlers = {
 *     "storage" = "Drupal\Core\Entity\Sql\SqlContentEntityStorage",
 *   },
 * )
 */
class ChatSession extends ContentEntityBase {

  /**
   * {@inheritdoc}
   */
  public static function baseFieldDefinitions(EntityTypeInterface $entity_type) {
    $fields = parent::baseFieldDefinitions($entity_type);

    // User ID - tương đương userId trong MongoDB
    $fields['user_id'] = BaseFieldDefinition::create('entity_reference')
      ->setLabel(t('User'))
      ->setDescription(t('The user ID who owns this session'))
      ->setSetting('target_type', 'user')
      ->setRequired(TRUE);

    // Refresh Token - tương đương refreshToken trong MongoDB
    $fields['refresh_token'] = BaseFieldDefinition::create('string')
      ->setLabel(t('Refresh Token'))
      ->setDescription(t('The refresh token string'))
      ->setSettings([
        'max_length' => 255,
      ])
      ->setRequired(TRUE);

    // Expires At - tương đương expiresAt trong MongoDB
    $fields['expires_at'] = BaseFieldDefinition::create('timestamp')
      ->setLabel(t('Expires At'))
      ->setDescription(t('When this session expires'))
      ->setRequired(TRUE);

    // Created - tự động như timestamps trong MongoDB
    $fields['created'] = BaseFieldDefinition::create('created')
      ->setLabel(t('Created'))
      ->setDescription(t('The time the session was created'));

    return $fields;
  }

}
