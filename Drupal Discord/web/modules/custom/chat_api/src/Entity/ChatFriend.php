<?php

namespace Drupal\chat_api\Entity;

use Drupal\Core\Entity\ContentEntityBase;
use Drupal\Core\Entity\EntityTypeInterface;
use Drupal\Core\Field\BaseFieldDefinition;
use Drupal\Core\Entity\EntityStorageInterface;

/**
 * Defines the Chat Friend entity.
 *
 * @ContentEntityType(
 * id = "chat_friend",
 * label = @Translation("Friend Relationship"),
 * base_table = "chat_friend",
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
class ChatFriend extends ContentEntityBase {

  /**
   * {@inheritdoc}
   */
  public static function baseFieldDefinitions(EntityTypeInterface $entity_type) {
    $fields = parent::baseFieldDefinitions($entity_type);

    // User A
    $fields['user_a'] = BaseFieldDefinition::create('entity_reference')
      ->setLabel(t('User A'))
      ->setDescription(t('First user in friendship (smaller ID)'))
      ->setSetting('target_type', 'user')
      ->setRequired(TRUE);

    // User B
    $fields['user_b'] = BaseFieldDefinition::create('entity_reference')
      ->setLabel(t('User B'))
      ->setDescription(t('Second user in friendship (larger ID)'))
      ->setSetting('target_type', 'user')
      ->setRequired(TRUE);

    // Created timestamp
    $fields['created'] = BaseFieldDefinition::create('created')
      ->setLabel(t('Created'))
      ->setDescription(t('When the friendship was created'));

    return $fields;
  }

  /**
   * {@inheritdoc}
   */
  public function preSave(EntityStorageInterface $storage) {
    parent::preSave($storage);

    $a = (int) $this->get('user_a')->target_id;
    $b = (int) $this->get('user_b')->target_id;

    if ($a > $b) {
      $this->set('user_a', $b);
      $this->set('user_b', $a);
    }
  }

}