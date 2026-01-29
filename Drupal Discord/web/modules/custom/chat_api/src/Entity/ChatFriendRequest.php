<?php

namespace Drupal\chat_api\Entity;

use Drupal\Core\Entity\ContentEntityBase;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Field\BaseFieldDefinition;

/**
 * Defines the Chat Friend Request entity.
 *
 * @ContentEntityType(
 * id = "chat_friend_request",
 * label = @Translation("Friend Request"),
 * base_table = "chat_friend_request",
 * admin_permission = "administer site configuration",
 * entity_keys = {
 * "id" = "id",
 * "uuid" = "uuid",
 * },
 * handlers = {
 * "storage" = "Drupal\Core\Entity\Sql\SqlContentEntityStorage",
 * "views_data" = "Drupal\views\EntityViewsData",
 * },
 * )
 */
class ChatFriendRequest extends ContentEntityBase {

  /**
   * {@inheritdoc}
   */
  public static function baseFieldDefinitions(EntityTypeInterface $entity_type) {
    $fields = parent::baseFieldDefinitions($entity_type);

    // From - người gửi lời mời
    $fields['from_user'] = BaseFieldDefinition::create('entity_reference')
      ->setLabel(t('From User'))
      ->setDescription(t('The user who sent the friend request'))
      ->setSetting('target_type', 'user')
      ->setRequired(TRUE);

    // To - người nhận lời mời
    $fields['to_user'] = BaseFieldDefinition::create('entity_reference')
      ->setLabel(t('To User'))
      ->setDescription(t('The user who receives the friend request'))
      ->setSetting('target_type', 'user')
      ->setRequired(TRUE);

    // Message
    $fields['message'] = BaseFieldDefinition::create('string_long')
      ->setLabel(t('Message'))
      ->setDescription(t('Optional message with the friend request'))
      ->setSettings([
        'max_length' => 300,
      ])
      ->setRequired(FALSE);

    // Created timestamp
    $fields['created'] = BaseFieldDefinition::create('created')
      ->setLabel(t('Created'))
      ->setDescription(t('When the request was created'));

    return $fields;
  }

}