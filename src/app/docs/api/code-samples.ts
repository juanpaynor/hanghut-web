export type Lang = 'curl' | 'javascript' | 'python' | 'php' | 'ruby'

export const LANG_LABELS: Record<Lang, string> = {
    curl: 'cURL',
    javascript: 'JavaScript',
    python: 'Python',
    php: 'PHP',
    ruby: 'Ruby',
}

export interface CodeSample {
    curl: string
    javascript: string
    python: string
    php: string
    ruby: string
}

// ─── Authentication ───
export const authSamples: CodeSample = {
    curl: `curl https://www.hanghut.com/api/v1/events \\
  -H "Authorization: Bearer hh_live_your_key"`,
    javascript: `const response = await fetch(
  'https://www.hanghut.com/api/v1/events',
  {
    headers: {
      'Authorization': \`Bearer \${API_KEY}\`
    }
  }
);
const { data } = await response.json();`,
    python: `import requests

response = requests.get(
    "https://www.hanghut.com/api/v1/events",
    headers={"Authorization": f"Bearer {api_key}"}
)
events = response.json()["data"]`,
    php: `<?php
$ch = curl_init('https://www.hanghut.com/api/v1/events');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey
    ]
]);
$response = json_decode(curl_exec($ch));
$events = $response->data;`,
    ruby: `require 'net/http'
require 'json'

uri = URI('https://www.hanghut.com/api/v1/events')
req = Net::HTTP::Get.new(uri)
req['Authorization'] = "Bearer #{api_key}"

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
events = JSON.parse(res.body)['data']`,
}

// ─── List Events ───
export const listEventsSamples: CodeSample = {
    curl: `curl "https://www.hanghut.com/api/v1/events?page=1&per_page=10" \\
  -H "Authorization: Bearer hh_live_your_key"`,
    javascript: `const res = await fetch(
  'https://www.hanghut.com/api/v1/events?page=1&per_page=10',
  {
    headers: {
      'Authorization': \`Bearer \${API_KEY}\`
    }
  }
);
const { data } = await res.json();
console.log(data.events);    // Array of events
console.log(data.meta.total); // Total count`,
    python: `import requests

response = requests.get(
    "https://www.hanghut.com/api/v1/events",
    params={"page": 1, "per_page": 10},
    headers={"Authorization": f"Bearer {api_key}"}
)
data = response.json()["data"]
for event in data["events"]:
    print(f"{event['title']} — {event['tickets_sold']}/{event['capacity']}")`,
    php: `<?php
$ch = curl_init('https://www.hanghut.com/api/v1/events?page=1&per_page=10');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey
    ]
]);
$response = json_decode(curl_exec($ch));
foreach ($response->data->events as $event) {
    echo $event->title . " — " . $event->tickets_sold . " sold\\n";
}`,
    ruby: `require 'net/http'
require 'json'

uri = URI('https://www.hanghut.com/api/v1/events?page=1&per_page=10')
req = Net::HTTP::Get.new(uri)
req['Authorization'] = "Bearer #{api_key}"

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
data = JSON.parse(res.body)['data']
data['events'].each { |e| puts "#{e['title']} — #{e['tickets_sold']} sold" }`,
}

// ─── Get Event ───
export const getEventSamples: CodeSample = {
    curl: `curl "https://www.hanghut.com/api/v1/events/8db0f243-2e64-..." \\
  -H "Authorization: Bearer hh_live_your_key"`,
    javascript: `const res = await fetch(
  \`https://www.hanghut.com/api/v1/events/\${eventId}\`,
  {
    headers: { 'Authorization': \`Bearer \${API_KEY}\` }
  }
);
const { data: event } = await res.json();

// Show each tier with availability
event.ticket_tiers.forEach(tier => {
  console.log(\`\${tier.name}: ₱\${tier.price} — \${tier.available} left\`);
});`,
    python: `import requests

response = requests.get(
    f"https://www.hanghut.com/api/v1/events/{event_id}",
    headers={"Authorization": f"Bearer {api_key}"}
)
event = response.json()["data"]

for tier in event["ticket_tiers"]:
    print(f"{tier['name']}: ₱{tier['price']} — {tier['available']} left")`,
    php: `<?php
$ch = curl_init("https://www.hanghut.com/api/v1/events/{$eventId}");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey
    ]
]);
$event = json_decode(curl_exec($ch))->data;

foreach ($event->ticket_tiers as $tier) {
    echo "{$tier->name}: ₱{$tier->price} — {$tier->available} left\\n";
}`,
    ruby: `require 'net/http'
require 'json'

uri = URI("https://www.hanghut.com/api/v1/events/#{event_id}")
req = Net::HTTP::Get.new(uri)
req['Authorization'] = "Bearer #{api_key}"

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
event = JSON.parse(res.body)['data']
event['ticket_tiers'].each do |tier|
  puts "#{tier['name']}: ₱#{tier['price']} — #{tier['available']} left"
end`,
}

// ─── Create Event ───
export const createEventSamples: CodeSample = {
    curl: `curl -X POST "https://www.hanghut.com/api/v1/events" \\
  -H "Authorization: Bearer hh_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Friday Night Comedy",
    "start_datetime": "2026-04-10T20:00:00+08:00",
    "venue_name": "Comedy Bar Manila",
    "city": "Manila",
    "capacity": 150,
    "ticket_price": 800
  }'`,
    javascript: `const res = await fetch('https://www.hanghut.com/api/v1/events', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${API_KEY}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'Friday Night Comedy',
    start_datetime: '2026-04-10T20:00:00+08:00',
    venue_name: 'Comedy Bar Manila',
    city: 'Manila',
    capacity: 150,
    ticket_price: 800
  })
});
const { data: event } = await res.json();
console.log('Created:', event.id, event.status); // draft`,
    python: `import requests

response = requests.post(
    "https://www.hanghut.com/api/v1/events",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    },
    json={
        "title": "Friday Night Comedy",
        "start_datetime": "2026-04-10T20:00:00+08:00",
        "venue_name": "Comedy Bar Manila",
        "city": "Manila",
        "capacity": 150,
        "ticket_price": 800,
    }
)
event = response.json()["data"]
print(f"Created: {event['id']} — {event['status']}")`,
    php: `<?php
$payload = json_encode([
    'title' => 'Friday Night Comedy',
    'start_datetime' => '2026-04-10T20:00:00+08:00',
    'venue_name' => 'Comedy Bar Manila',
    'city' => 'Manila',
    'capacity' => 150,
    'ticket_price' => 800,
]);

$ch = curl_init('https://www.hanghut.com/api/v1/events');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]
]);
$event = json_decode(curl_exec($ch))->data;
echo "Created: {$event->id} — {$event->status}\\n";`,
    ruby: `require 'net/http'
require 'json'

uri = URI('https://www.hanghut.com/api/v1/events')
req = Net::HTTP::Post.new(uri)
req['Authorization'] = "Bearer #{api_key}"
req['Content-Type'] = 'application/json'
req.body = {
  title: 'Friday Night Comedy',
  start_datetime: '2026-04-10T20:00:00+08:00',
  venue_name: 'Comedy Bar Manila',
  city: 'Manila',
  capacity: 150,
  ticket_price: 800
}.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
event = JSON.parse(res.body)['data']
puts "Created: #{event['id']} — #{event['status']}"`,
}

// ─── Update Event ───
export const updateEventSamples: CodeSample = {
    curl: `curl -X PUT "https://www.hanghut.com/api/v1/events/f47ac10b-..." \\
  -H "Authorization: Bearer hh_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "active", "capacity": 200}'`,
    javascript: `const res = await fetch(
  \`https://www.hanghut.com/api/v1/events/\${eventId}\`,
  {
    method: 'PUT',
    headers: {
      'Authorization': \`Bearer \${API_KEY}\`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'active', capacity: 200 })
  }
);
const { data: event } = await res.json();`,
    python: `import requests

response = requests.put(
    f"https://www.hanghut.com/api/v1/events/{event_id}",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    },
    json={"status": "active", "capacity": 200}
)
event = response.json()["data"]`,
    php: `<?php
$ch = curl_init("https://www.hanghut.com/api/v1/events/{$eventId}");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => 'PUT',
    CURLOPT_POSTFIELDS => json_encode([
        'status' => 'active',
        'capacity' => 200
    ]),
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]
]);
$event = json_decode(curl_exec($ch))->data;`,
    ruby: `require 'net/http'
require 'json'

uri = URI("https://www.hanghut.com/api/v1/events/#{event_id}")
req = Net::HTTP::Put.new(uri)
req['Authorization'] = "Bearer #{api_key}"
req['Content-Type'] = 'application/json'
req.body = { status: 'active', capacity: 200 }.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
event = JSON.parse(res.body)['data']`,
}

// ─── List Attendees ───
export const listAttendeesSamples: CodeSample = {
    curl: `curl "https://www.hanghut.com/api/v1/events/8db0f243-.../attendees?status=sold" \\
  -H "Authorization: Bearer hh_live_your_key"`,
    javascript: `const res = await fetch(
  \`https://www.hanghut.com/api/v1/events/\${eventId}/attendees?status=sold\`,
  {
    headers: { 'Authorization': \`Bearer \${API_KEY}\` }
  }
);
const { data } = await res.json();
data.attendees.forEach(a => {
  console.log(\`\${a.customer.name} — \${a.tier.name} — \${a.status}\`);
});`,
    python: `import requests

response = requests.get(
    f"https://www.hanghut.com/api/v1/events/{event_id}/attendees",
    params={"status": "sold"},
    headers={"Authorization": f"Bearer {api_key}"}
)
data = response.json()["data"]
for attendee in data["attendees"]:
    print(f"{attendee['customer']['name']} — {attendee['tier']['name']}")`,
    php: `<?php
$url = "https://www.hanghut.com/api/v1/events/{$eventId}/attendees?status=sold";
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey
    ]
]);
$data = json_decode(curl_exec($ch))->data;
foreach ($data->attendees as $a) {
    echo "{$a->customer->name} — {$a->tier->name}\\n";
}`,
    ruby: `require 'net/http'
require 'json'

uri = URI("https://www.hanghut.com/api/v1/events/#{event_id}/attendees?status=sold")
req = Net::HTTP::Get.new(uri)
req['Authorization'] = "Bearer #{api_key}"

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
data = JSON.parse(res.body)['data']
data['attendees'].each { |a| puts "#{a['customer']['name']} — #{a['tier']['name']}" }`,
}

// ─── Create Checkout ───
export const createCheckoutSamples: CodeSample = {
    curl: `curl -X POST "https://www.hanghut.com/api/v1/checkouts" \\
  -H "Authorization: Bearer hh_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_id": "8db0f243-2e64-...",
    "tier_id": "66a5cdd3-d097-...",
    "quantity": 2,
    "customer": {
      "name": "Juan Dela Cruz",
      "email": "juan@example.com"
    },
    "success_url": "https://your-site.com/success",
    "cancel_url": "https://your-site.com/cancel"
  }'`,
    javascript: `// Server-side: create checkout and redirect
app.post('/buy-ticket', async (req, res) => {
  const response = await fetch(
    'https://www.hanghut.com/api/v1/checkouts',
    {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${API_KEY}\`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event_id: req.body.event_id,
        tier_id: req.body.tier_id,
        quantity: req.body.quantity,
        customer: {
          name: req.body.name,
          email: req.body.email
        },
        success_url: 'https://your-site.com/thank-you',
        cancel_url: 'https://your-site.com/events'
      })
    }
  );
  const { data } = await response.json();
  res.redirect(data.checkout_url);
});`,
    python: `import requests

response = requests.post(
    "https://www.hanghut.com/api/v1/checkouts",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    },
    json={
        "event_id": "8db0f243-2e64-...",
        "tier_id": "66a5cdd3-d097-...",
        "quantity": 2,
        "customer": {
            "name": "Juan Dela Cruz",
            "email": "juan@example.com"
        },
        "success_url": "https://your-site.com/success",
        "cancel_url": "https://your-site.com/cancel",
    }
)
checkout = response.json()["data"]
print(f"Redirect to: {checkout['checkout_url']}")`,
    php: `<?php
$payload = json_encode([
    'event_id' => '8db0f243-2e64-...',
    'tier_id' => '66a5cdd3-d097-...',
    'quantity' => 2,
    'customer' => [
        'name' => 'Juan Dela Cruz',
        'email' => 'juan@example.com'
    ],
    'success_url' => 'https://your-site.com/success',
    'cancel_url' => 'https://your-site.com/cancel',
]);

$ch = curl_init('https://www.hanghut.com/api/v1/checkouts');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]
]);
$checkout = json_decode(curl_exec($ch))->data;
header('Location: ' . $checkout->checkout_url);`,
    ruby: `require 'net/http'
require 'json'

uri = URI('https://www.hanghut.com/api/v1/checkouts')
req = Net::HTTP::Post.new(uri)
req['Authorization'] = "Bearer #{api_key}"
req['Content-Type'] = 'application/json'
req.body = {
  event_id: '8db0f243-2e64-...',
  tier_id: '66a5cdd3-d097-...',
  quantity: 2,
  customer: { name: 'Juan Dela Cruz', email: 'juan@example.com' },
  success_url: 'https://your-site.com/success',
  cancel_url: 'https://your-site.com/cancel'
}.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
checkout = JSON.parse(res.body)['data']
# Redirect user to checkout['checkout_url']`,
}

// ─── Verify Ticket ───
export const verifyTicketSamples: CodeSample = {
    curl: `curl "https://www.hanghut.com/api/v1/tickets/a1b2c3d4-..." \\
  -H "Authorization: Bearer hh_live_your_key"`,
    javascript: `const res = await fetch(
  \`https://www.hanghut.com/api/v1/tickets/\${ticketId}\`,
  {
    headers: { 'Authorization': \`Bearer \${API_KEY}\` }
  }
);
const { data: ticket } = await res.json();

if (ticket.status === 'sold') {
  console.log(\`✅ VALID — \${ticket.customer.name}\`);
} else if (ticket.status === 'checked_in') {
  console.log(\`⚠️ ALREADY USED at \${ticket.checked_in_at}\`);
} else {
  console.log(\`❌ INVALID — status: \${ticket.status}\`);
}`,
    python: `import requests

response = requests.get(
    f"https://www.hanghut.com/api/v1/tickets/{ticket_id}",
    headers={"Authorization": f"Bearer {api_key}"}
)
ticket = response.json()["data"]

if ticket["status"] == "sold":
    print(f"✅ VALID — {ticket['customer']['name']}")
elif ticket["status"] == "checked_in":
    print(f"⚠️ ALREADY USED at {ticket['checked_in_at']}")
else:
    print(f"❌ INVALID — status: {ticket['status']}")`,
    php: `<?php
$ch = curl_init("https://www.hanghut.com/api/v1/tickets/{$ticketId}");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey
    ]
]);
$ticket = json_decode(curl_exec($ch))->data;

if ($ticket->status === 'sold') {
    echo "✅ VALID — {$ticket->customer->name}\\n";
} elseif ($ticket->status === 'checked_in') {
    echo "⚠️ ALREADY USED at {$ticket->checked_in_at}\\n";
} else {
    echo "❌ INVALID — status: {$ticket->status}\\n";
}`,
    ruby: `require 'net/http'
require 'json'

uri = URI("https://www.hanghut.com/api/v1/tickets/#{ticket_id}")
req = Net::HTTP::Get.new(uri)
req['Authorization'] = "Bearer #{api_key}"

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
ticket = JSON.parse(res.body)['data']

case ticket['status']
when 'sold'
  puts "✅ VALID — #{ticket['customer']['name']}"
when 'checked_in'
  puts "⚠️ ALREADY USED at #{ticket['checked_in_at']}"
else
  puts "❌ INVALID — status: #{ticket['status']}"
end`,
}

// ─── Check In ───
export const checkInSamples: CodeSample = {
    curl: `curl -X POST "https://www.hanghut.com/api/v1/tickets/a1b2c3d4-.../check-in" \\
  -H "Authorization: Bearer hh_live_your_key"`,
    javascript: `const res = await fetch(
  \`https://www.hanghut.com/api/v1/tickets/\${ticketId}/check-in\`,
  {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${API_KEY}\` }
  }
);
if (res.status === 409) {
  console.log('Ticket already used or invalid');
} else {
  const { data } = await res.json();
  console.log(\`Checked in: \${data.customer.name} at \${data.checked_in_at}\`);
}`,
    python: `import requests

response = requests.post(
    f"https://www.hanghut.com/api/v1/tickets/{ticket_id}/check-in",
    headers={"Authorization": f"Bearer {api_key}"}
)
if response.status_code == 409:
    print("Ticket already used or invalid")
else:
    data = response.json()["data"]
    print(f"Checked in: {data['customer']['name']} at {data['checked_in_at']}")`,
    php: `<?php
$ch = curl_init("https://www.hanghut.com/api/v1/tickets/{$ticketId}/check-in");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey
    ]
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if ($httpCode === 409) {
    echo "Ticket already used or invalid\\n";
} else {
    $data = json_decode($response)->data;
    echo "Checked in: {$data->customer->name} at {$data->checked_in_at}\\n";
}`,
    ruby: `require 'net/http'
require 'json'

uri = URI("https://www.hanghut.com/api/v1/tickets/#{ticket_id}/check-in")
req = Net::HTTP::Post.new(uri)
req['Authorization'] = "Bearer #{api_key}"

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
if res.code == '409'
  puts 'Ticket already used or invalid'
else
  data = JSON.parse(res.body)['data']
  puts "Checked in: #{data['customer']['name']} at #{data['checked_in_at']}"
end`,
}

// ─── Refund Ticket ───
export const refundTicketSamples: CodeSample = {
    curl: `curl -X POST "https://www.hanghut.com/api/v1/tickets/a1b2c3d4-.../refund" \\
  -H "Authorization: Bearer hh_live_your_key"`,
    javascript: `const res = await fetch(
  \`https://www.hanghut.com/api/v1/tickets/\${ticketId}/refund\`,
  {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${API_KEY}\` }
  }
);
const { data } = await res.json();
console.log(\`Refunded: \${data.id} — \${data.status}\`);`,
    python: `import requests

response = requests.post(
    f"https://www.hanghut.com/api/v1/tickets/{ticket_id}/refund",
    headers={"Authorization": f"Bearer {api_key}"}
)
data = response.json()["data"]
print(f"Refunded: {data['id']} — {data['status']}")`,
    php: `<?php
$ch = curl_init("https://www.hanghut.com/api/v1/tickets/{$ticketId}/refund");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey
    ]
]);
$data = json_decode(curl_exec($ch))->data;
echo "Refunded: {$data->id} — {$data->status}\\n";`,
    ruby: `require 'net/http'
require 'json'

uri = URI("https://www.hanghut.com/api/v1/tickets/#{ticket_id}/refund")
req = Net::HTTP::Post.new(uri)
req['Authorization'] = "Bearer #{api_key}"

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
data = JSON.parse(res.body)['data']
puts "Refunded: #{data['id']} — #{data['status']}"`,
}

// ─── List Orders ───
export const listOrdersSamples: CodeSample = {
    curl: `curl "https://www.hanghut.com/api/v1/orders?event_id=8db0f243-..." \\
  -H "Authorization: Bearer hh_live_your_key"`,
    javascript: `const res = await fetch(
  \`https://www.hanghut.com/api/v1/orders?event_id=\${eventId}\`,
  {
    headers: { 'Authorization': \`Bearer \${API_KEY}\` }
  }
);
const { data } = await res.json();
data.orders.forEach(order => {
  console.log(\`\${order.customer.name}: \${order.quantity}x — ₱\${order.total_amount}\`);
});`,
    python: `import requests

response = requests.get(
    "https://www.hanghut.com/api/v1/orders",
    params={"event_id": event_id},
    headers={"Authorization": f"Bearer {api_key}"}
)
data = response.json()["data"]
for order in data["orders"]:
    print(f"{order['customer']['name']}: {order['quantity']}x — ₱{order['total_amount']}")`,
    php: `<?php
$ch = curl_init("https://www.hanghut.com/api/v1/orders?event_id={$eventId}");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey
    ]
]);
$data = json_decode(curl_exec($ch))->data;
foreach ($data->orders as $order) {
    echo "{$order->customer->name}: {$order->quantity}x — ₱{$order->total_amount}\\n";
}`,
    ruby: `require 'net/http'
require 'json'

uri = URI("https://www.hanghut.com/api/v1/orders?event_id=#{event_id}")
req = Net::HTTP::Get.new(uri)
req['Authorization'] = "Bearer #{api_key}"

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
data = JSON.parse(res.body)['data']
data['orders'].each { |o| puts "#{o['customer']['name']}: #{o['quantity']}x — ₱#{o['total_amount']}" }`,
}

// ─── Register Webhook ───
export const registerWebhookSamples: CodeSample = {
    curl: `curl -X POST "https://www.hanghut.com/api/v1/webhooks" \\
  -H "Authorization: Bearer hh_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://your-site.com/webhook",
    "events": ["ticket.purchased", "ticket.refunded"]
  }'`,
    javascript: `const res = await fetch('https://www.hanghut.com/api/v1/webhooks', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${API_KEY}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: 'https://your-site.com/webhook',
    events: ['ticket.purchased', 'ticket.refunded']
  })
});
const { data: webhook } = await res.json();
// Save webhook.secret — it's only shown once!
console.log('Webhook secret:', webhook.secret);`,
    python: `import requests

response = requests.post(
    "https://www.hanghut.com/api/v1/webhooks",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    },
    json={
        "url": "https://your-site.com/webhook",
        "events": ["ticket.purchased", "ticket.refunded"]
    }
)
webhook = response.json()["data"]
# Save webhook["secret"] — it's only shown once!
print(f"Webhook secret: {webhook['secret']}")`,
    php: `<?php
$ch = curl_init('https://www.hanghut.com/api/v1/webhooks');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode([
        'url' => 'https://your-site.com/webhook',
        'events' => ['ticket.purchased', 'ticket.refunded']
    ]),
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]
]);
$webhook = json_decode(curl_exec($ch))->data;
// Save $webhook->secret — it's only shown once!
echo "Webhook secret: {$webhook->secret}\\n";`,
    ruby: `require 'net/http'
require 'json'

uri = URI('https://www.hanghut.com/api/v1/webhooks')
req = Net::HTTP::Post.new(uri)
req['Authorization'] = "Bearer #{api_key}"
req['Content-Type'] = 'application/json'
req.body = {
  url: 'https://your-site.com/webhook',
  events: ['ticket.purchased', 'ticket.refunded']
}.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
webhook = JSON.parse(res.body)['data']
# Save webhook['secret'] — it's only shown once!
puts "Webhook secret: #{webhook['secret']}"`,
}

// ─── Webhook Signature Verification ───
export const webhookVerifySamples: CodeSample = {
    curl: `# Webhook payloads are sent to YOUR endpoint.
# Verify the X-HangHut-Signature header:
# HMAC-SHA256(body, webhook_secret) === signature`,
    javascript: `const crypto = require('crypto');

function verifyWebhook(body, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Express middleware
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-hanghut-signature'];
  if (!verifyWebhook(req.body, sig, WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(req.body);
  switch (event.type) {
    case 'ticket.purchased':
      // Handle new ticket purchase
      break;
    case 'ticket.refunded':
      // Handle refund
      break;
  }
  res.status(200).send('OK');
});`,
    python: `import hmac
import hashlib
from flask import Flask, request

app = Flask(__name__)

def verify_webhook(body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)

@app.route("/webhook", methods=["POST"])
def webhook():
    sig = request.headers.get("X-HangHut-Signature")
    if not verify_webhook(request.data, sig, WEBHOOK_SECRET):
        return "Invalid signature", 401

    event = request.json
    if event["type"] == "ticket.purchased":
        # Handle new ticket purchase
        pass
    elif event["type"] == "ticket.refunded":
        # Handle refund
        pass

    return "OK", 200`,
    php: `<?php
$payload = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_HANGHUT_SIGNATURE'];
$secret = getenv('WEBHOOK_SECRET');

$expected = hash_hmac('sha256', $payload, $secret);

if (!hash_equals($expected, $signature)) {
    http_response_code(401);
    echo 'Invalid signature';
    exit;
}

$event = json_decode($payload);

switch ($event->type) {
    case 'ticket.purchased':
        // Handle new ticket purchase
        break;
    case 'ticket.refunded':
        // Handle refund
        break;
}

http_response_code(200);
echo 'OK';`,
    ruby: `require 'sinatra'
require 'json'
require 'openssl'

post '/webhook' do
  payload = request.body.read
  signature = request.env['HTTP_X_HANGHUT_SIGNATURE']
  secret = ENV['WEBHOOK_SECRET']

  expected = OpenSSL::HMAC.hexdigest('SHA256', secret, payload)
  halt 401, 'Invalid signature' unless Rack::Utils.secure_compare(expected, signature)

  event = JSON.parse(payload)
  case event['type']
  when 'ticket.purchased'
    # Handle new ticket purchase
  when 'ticket.refunded'
    # Handle refund
  end

  status 200
  'OK'
end`,
}

// ─── Analytics ───
export const analyticsSamples: CodeSample = {
    curl: `curl "https://www.hanghut.com/api/v1/analytics/sales?from=2026-03-01&to=2026-03-31" \\
  -H "Authorization: Bearer hh_live_your_key"`,
    javascript: `const res = await fetch(
  'https://www.hanghut.com/api/v1/analytics/sales?from=2026-03-01&to=2026-03-31',
  {
    headers: { 'Authorization': \`Bearer \${API_KEY}\` }
  }
);
const { data } = await res.json();
console.log(\`Revenue: ₱\${data.total_revenue}\`);
console.log(\`Tickets: \${data.total_tickets_sold}\`);`,
    python: `import requests

response = requests.get(
    "https://www.hanghut.com/api/v1/analytics/sales",
    params={"from": "2026-03-01", "to": "2026-03-31"},
    headers={"Authorization": f"Bearer {api_key}"}
)
data = response.json()["data"]
print(f"Revenue: ₱{data['total_revenue']}")
print(f"Tickets: {data['total_tickets_sold']}")`,
    php: `<?php
$ch = curl_init('https://www.hanghut.com/api/v1/analytics/sales?from=2026-03-01&to=2026-03-31');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey
    ]
]);
$data = json_decode(curl_exec($ch))->data;
echo "Revenue: ₱{$data->total_revenue}\\n";
echo "Tickets: {$data->total_tickets_sold}\\n";`,
    ruby: `require 'net/http'
require 'json'

uri = URI('https://www.hanghut.com/api/v1/analytics/sales?from=2026-03-01&to=2026-03-31')
req = Net::HTTP::Get.new(uri)
req['Authorization'] = "Bearer #{api_key}"

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
data = JSON.parse(res.body)['data']
puts "Revenue: ₱#{data['total_revenue']}"
puts "Tickets: #{data['total_tickets_sold']}"`,
}

// ─── Create Promo Code ───
export const createPromoSamples: CodeSample = {
    curl: `curl -X POST "https://www.hanghut.com/api/v1/promo-codes" \\
  -H "Authorization: Bearer hh_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_id": "8db0f243-...",
    "code": "EARLYBIRD",
    "discount_type": "percentage",
    "discount_amount": 20,
    "usage_limit": 50,
    "expires_at": "2026-04-01T00:00:00Z"
  }'`,
    javascript: `const res = await fetch('https://www.hanghut.com/api/v1/promo-codes', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${API_KEY}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    event_id: '8db0f243-...',
    code: 'EARLYBIRD',
    discount_type: 'percentage',
    discount_amount: 20,
    usage_limit: 50,
    expires_at: '2026-04-01T00:00:00Z'
  })
});
const { data: promo } = await res.json();
console.log(\`Created: \${promo.code} — \${promo.discount_amount}% off\`);`,
    python: `import requests

response = requests.post(
    "https://www.hanghut.com/api/v1/promo-codes",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    },
    json={
        "event_id": "8db0f243-...",
        "code": "EARLYBIRD",
        "discount_type": "percentage",
        "discount_amount": 20,
        "usage_limit": 50,
        "expires_at": "2026-04-01T00:00:00Z",
    }
)
promo = response.json()["data"]
print(f"Created: {promo['code']} — {promo['discount_amount']}% off")`,
    php: `<?php
$ch = curl_init('https://www.hanghut.com/api/v1/promo-codes');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode([
        'event_id' => '8db0f243-...',
        'code' => 'EARLYBIRD',
        'discount_type' => 'percentage',
        'discount_amount' => 20,
        'usage_limit' => 50,
        'expires_at' => '2026-04-01T00:00:00Z',
    ]),
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]
]);
$promo = json_decode(curl_exec($ch))->data;
echo "Created: {$promo->code} — {$promo->discount_amount}% off\\n";`,
    ruby: `require 'net/http'
require 'json'

uri = URI('https://www.hanghut.com/api/v1/promo-codes')
req = Net::HTTP::Post.new(uri)
req['Authorization'] = "Bearer #{api_key}"
req['Content-Type'] = 'application/json'
req.body = {
  event_id: '8db0f243-...',
  code: 'EARLYBIRD',
  discount_type: 'percentage',
  discount_amount: 20,
  usage_limit: 50,
  expires_at: '2026-04-01T00:00:00Z'
}.to_json

res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http|
  http.request(req)
}
promo = JSON.parse(res.body)['data']
puts "Created: #{promo['code']} — #{promo['discount_amount']}% off"`,
}
