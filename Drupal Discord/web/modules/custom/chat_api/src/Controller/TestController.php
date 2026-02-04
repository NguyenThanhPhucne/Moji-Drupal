<?php
// Test API endpoint - PUBLIC ACCESS
namespace Drupal\chat_api\Controller;

use Drupal\Core\Controller\ControllerBase;
use Symfony\Component\HttpFoundation\JsonResponse;

class TestController extends ControllerBase {
  public function testConversationsAPI() {
    $url = 'http://localhost:5001/api/conversations/admin/conversations';
    
    try {
      $response = \Drupal::httpClient()->get($url, [
        'timeout' => 5,
      ]);
      
      $statusCode = $response->getStatusCode();
      $body = $response->getBody()->getContents();
      $data = json_decode($body, TRUE);
      
      return new JsonResponse([
        'test' => 'OK',
        'statusCode' => $statusCode,
        'apiResponse' => $data,
      ]);
    } catch (\Exception $e) {
      return new JsonResponse([
        'test' => 'ERROR',
        'error' => $e->getMessage(),
      ], 500);
    }
  }
}
?>
