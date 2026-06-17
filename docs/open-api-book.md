# Epic Open API - Book Data Interface Documentation

## Overview

This API allows authorized third-party partners to retrieve book detail data and upload interactive book data (labData).

**Base URL:**

| Environment | Base URL |
|-------------|----------|
| QA | `https://qa-new.getepic.dev/openapi/book.php` |
| Production | `https://api-web.getepic.com/openapi/book.php` |

---

## Authentication

All endpoints require HMAC-SHA256 signature verification.

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `X-Api-Key` | Yes | API Key assigned to the partner |
| `X-Signature` | Yes | HMAC-SHA256 signature |
| `X-Timestamp` | Yes | Current Unix timestamp (seconds) |

### Signature Algorithm

```
signature = HMAC-SHA256(request_body + timestamp, api_secret)
```

- **request_body**: Raw request body (empty string `""` for GET requests)
- **timestamp**: Value of the `X-Timestamp` header
- **api_secret**: API Secret assigned to the partner

### Signature Example (JavaScript)

```javascript
const CryptoJS = require('crypto-js');

const apiSecret = "your_api_secret";
const timestamp = Math.floor(Date.now() / 1000).toString();
const body = "";  // Empty for GET, JSON string for POST

const signContent = body + timestamp;
const signature = CryptoJS.HmacSHA256(signContent, apiSecret).toString(CryptoJS.enc.Hex);
```

### Signature Example (Python)

```python
import hmac, hashlib, time

api_secret = "your_api_secret"
timestamp = str(int(time.time()))
body = ""  # Empty for GET, JSON string for POST

sign_content = body + timestamp
signature = hmac.new(api_secret.encode(), sign_content.encode(), hashlib.sha256).hexdigest()
```

### Replay Protection

The server validates that `X-Timestamp` is within **5 minutes** (300 seconds) of the server time. Requests outside this window will be rejected with `401`.

---

## Endpoints

### 1. Get Book Full Data

Retrieve complete data for a specified book, including publisher info, ePub content, and interactive data.

**Request**

```
GET /openapi/book.php?action=getFullData&book_id={book_id}
```

**Parameters**

| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| `action` | Query | string | Yes | Fixed value: `getFullData` |
| `book_id` | Query | int | Yes | Book ID |

**Request Example**

```bash
TIMESTAMP=$(date +%s)
BODY=""
SIGNATURE=$(echo -n "${BODY}${TIMESTAMP}" | openssl dgst -sha256 -hmac "your_api_secret" | awk '{print $2}')

curl -X GET "https://qa-new.getepic.dev/openapi/book.php?action=getFullData&book_id=5119" \
  -H "X-Api-Key: your_api_key" \
  -H "X-Signature: ${SIGNATURE}" \
  -H "X-Timestamp: ${TIMESTAMP}"
```

**Success Response** `200 OK`

```json
{
  "publisherData": {
    "modelId": "1",
    "name": "Publisher Name",
    "url": "http://www.publisher.com/",
    "checkout": 1,
    "educationalEnabled": 1,
    "dateModified": 1600645704
  },
  "epub": {
    "spine": [
      {
        "page": "drm//5119/OEBPS/Images/1/abc123.jpg",
        "pageCdn": "https://cdn.getepic.com/drm//5119/OEBPS/Images/1/abc123.jpg?ttl=xxx&token=xxx"
      }
    ],
    "extra": {
      "copyright": "drm//5119/OEBPS/Images/1/copyright.jpg",
      "color": "#fffefe",
      "copyrightCdn": "https://cdn.getepic.com/drm//5119/OEBPS/Images/1/copyright.jpg?ttl=xxx&token=xxx"
    }
  },
  "timePerPage": 4,
  "book": {
    "modelId": "5119",
    "id": "5119",
    "title": "Book Title",
    "author": "Author Name",
    "illustrator": "Illustrator Name",
    "numPages": 57,
    "bookDescription": "Book description text...",
    "coverColorR": 178,
    "coverColorG": 146,
    "coverColorB": 130,
    "publisher": "Publisher Name",
    "publisherId": "1",
    "age": 8,
    "audio": 0,
    "lexile": "550L",
    "type": 1,
    "subject": "83",
    "subjectDesc": "Stories",
    "aspectRatio": 0.7201,
    "language": 1,
    "readingAgeMin": 7,
    "readingAgeMax": 9,
    "labData": "<xml>interactive data</xml>",
    "extensionUrl": "https://partner.com/extension.js"
  }
}
```

**Field Descriptions**

| Field | Type | Description |
|-------|------|-------------|
| `publisherData` | object | Publisher information |
| `epub` | object/null | ePub content data (only available for standard books and articles) |
| `epub.spine` | array | Page image URLs with CDN addresses |
| `epub.extra` | object | Additional content such as copyright page |
| `timePerPage` | int | Recommended reading time per page (seconds) |
| `book` | object | Book metadata |
| `book.labData` | string | Interactive data (string format, defined by the partner). Empty string if no data exists |
| `book.extensionUrl` | string | Frontend extension JS URL (only present when labData exists) |
| `book.audio` | int | Whether the book has audio (0/1). Note: audio is automatically set to 0 when labData exists |

---

### 2. Upsert Book Interactive Data (labData)

Create or update interactive data for a specified book.

**Request**

```
POST /openapi/book.php?action=upsertLabData
Content-Type: application/json
```

**Parameters**

| Parameter | Location | Type | Required | Description |
|-----------|----------|------|----------|-------------|
| `action` | Query | string | Yes | Fixed value: `upsertLabData` |
| `book_id` | Body | int | Yes | Book ID |
| `labdata` | Body | string | Yes | Interactive data (string format, defined by the partner) |

**Request Body Example**

```json
{
  "book_id": 49524,
  "labdata": "<labData><pages><page index=\"0\"><hotspots><hotspot shape=\"rect\" coords=\"0,0,100,100\" action=\"playAudio\" value=\"audio1.mp3\"/></hotspots></page></pages></labData>"
}
```

**Request Example**

```bash
TIMESTAMP=$(date +%s)
BODY='{"book_id":49524,"labdata":"<labData>...</labData>"}'
SIGNATURE=$(echo -n "${BODY}${TIMESTAMP}" | openssl dgst -sha256 -hmac "your_api_secret" | awk '{print $2}')

curl -X POST "https://qa-new.getepic.dev/openapi/book.php?action=upsertLabData" \
  -H "X-Api-Key: your_api_key" \
  -H "X-Signature: ${SIGNATURE}" \
  -H "X-Timestamp: ${TIMESTAMP}" \
  -H "Content-Type: application/json" \
  -d "${BODY}"
```

**Success Response** `200 OK`

```json
{
  "success": true,
  "book_id": 49524
}
```

**Business Rules**

- Each `book_id` can only have its labData updated by the partner who first uploaded it. Other partners cannot overwrite existing data.
- The `book_id` must be in the partner's authorized whitelist.
- Once uploaded, the `getFullData` endpoint will return the corresponding `labData` and `extensionUrl` for that book.

---

## Postman Pre-request Script

Set `api_key` and `api_secret` variables in your Postman Environment, then add the following as a Pre-request Script to automatically generate signatures:

```javascript
const apiKey = pm.environment.get("api_key");
const apiSecret = pm.environment.get("api_secret");
const timestamp = Math.floor(Date.now() / 1000).toString();
const body = pm.request.body ? pm.request.body.raw || "" : "";

const signContent = body + timestamp;
const signature = CryptoJS.HmacSHA256(signContent, apiSecret).toString(CryptoJS.enc.Hex);

pm.request.headers.upsert({ key: "X-Api-Key", value: apiKey });
pm.request.headers.upsert({ key: "X-Signature", value: signature });
pm.request.headers.upsert({ key: "X-Timestamp", value: timestamp });
```

---

## Error Codes

| HTTP Status | Error Message | Description |
|-------------|--------------|-------------|
| 400 | `Missing book_id` | Missing book_id parameter |
| 400 | `Missing required fields: book_id, labdata` | POST request missing required fields |
| 400 | `Unknown action` | Unsupported action value |
| 401 | `Missing authentication headers` | Missing authentication headers |
| 401 | `Request expired` | Timestamp exceeds 5-minute validity window |
| 403 | `Invalid API key` | API Key is invalid or disabled |
| 403 | `Invalid signature` | Signature verification failed |
| 403 | `Book not authorized for this API key` | book_id is not in the authorized whitelist |
| 403 | `This book already has labData owned by another partner` | The book's labData belongs to another partner |
| 403 | `Book not found` | Book does not exist |
| 403 | `Book not active` | Book is not published/active |

---

## Important Notes

1. **Clock Synchronization**: Ensure your server time is accurate. Timestamp drift exceeding 5 minutes will cause request rejection.
2. **Signature Content**: For GET requests, the body is an empty string. The signature content is `"" + timestamp`.
3. **labData Format**: labData is a string whose format is defined by the partner. Ensure proper escaping when embedding in JSON.
4. **CDN Token Expiration**: CDN URLs in `epub.spine` contain time-limited tokens. Request fresh data when tokens expire.
5. **Whitelist**: Only authorized `book_id` values can be accessed. The whitelist is configured by administrators.
