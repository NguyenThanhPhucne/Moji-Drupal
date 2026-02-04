<?php
// Quick test to check backend API accessibility from Drupal

$url = 'http://localhost:5001/api/conversations/admin/conversations';

try {
  $response = \Drupal::httpClient()->get($url, [
    'timeout' => 5,
  ]);
  
  $statusCode = $response->getStatusCode();
  $body = $response->getBody()->getContents();
  $data = json_decode($body, TRUE);
  
  echo "✅ Status: $statusCode\n";
  echo "✅ Success: " . ($data['success'] ? 'YES' : 'NO') . "\n";
  echo "✅ Conversations count: " . count($data['data'] ?? []) . "\n";
  
} catch (\Exception $e) {
  echo "❌ Error: " . $e->getMessage() . "\n";
}
?>
