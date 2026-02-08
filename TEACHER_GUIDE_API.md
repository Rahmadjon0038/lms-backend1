# Teacher Guide API (Admin + Teacher)

This document describes the current backend contract for Guide pages.

## 1. Scope
Admin manages:
1. Levels (CRUD)
2. One protected main PDF per level
3. Lessons inside level (CRUD + reorder)
4. Lesson content (global):
- notes (markdown + color)
- lesson PDFs
- assignments
- vocabulary items
- vocabulary PDFs
- vocabulary images
- vocabulary markdown blocks
- YouTube video links

Teacher can read:
1. Levels and lessons
2. Protected level main PDF
3. Lesson detail content created by admin

## 2. Base URLs
- Admin: `/api/admin/guides`
- Teacher: `/api/teacher/guides`

## 3. Auth
Send JWT on every request:

```http
Authorization: Bearer <token>
```

## 4. Standard Responses
Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "message": "Error message",
  "errors": {}
}
```

## 5. File Security
- Files are stored in private storage (`private_uploads/`), not in public static directories.
- Files are accessible only through protected stream endpoints.
- PDF responses are returned as inline streams.

---

## 6. Admin APIs

### 6.1 Levels
- `GET /api/admin/guides/levels`
- `POST /api/admin/guides/levels`
- `GET /api/admin/guides/levels/:levelId`
- `PATCH /api/admin/guides/levels/:levelId`
- `DELETE /api/admin/guides/levels/:levelId`

Create/Update body:

```json
{
  "title": "Beginner A1",
  "description": "Basic level"
}
```

### 6.2 Level Main PDF (single file)
- `POST /api/admin/guides/levels/:levelId/main-pdf` (multipart/form-data)
- `GET /api/admin/guides/levels/:levelId/main-pdf`
- `GET /api/admin/guides/levels/:levelId/main-pdf/file`
- `DELETE /api/admin/guides/levels/:levelId/main-pdf`

Upload fields:
- `file` (required, `application/pdf`, max 20MB)

### 6.3 Lessons
- `POST /api/admin/guides/levels/:levelId/lessons`
- `PATCH /api/admin/guides/lessons/:lessonId`
- `DELETE /api/admin/guides/lessons/:lessonId`
- `PATCH /api/admin/guides/levels/:levelId/lessons/reorder`

Create/Update lesson body:

```json
{
  "topic_name": "Present Simple"
}
```

Reorder body:

```json
{
  "lessons": [
    { "id": 10, "order_index": 1 },
    { "id": 7, "order_index": 2 },
    { "id": 12, "order_index": 3 }
  ]
}
```

Rules:
- `lessons` must contain all lessons of that level.
- `order_index` must be continuous (`1..N`).
- No duplicates.

### 6.4 Composite lesson detail
- `GET /api/admin/guides/lessons/:lessonId`

Returns:
- `lesson`
- `notes`
- `pdfs`
- `assignments`
- `vocabulary`
- `vocabulary_pdfs`
- `vocabulary_images`
- `vocabulary_markdowns`
- `videos`
- `speech_settings` (current user)

### 6.5 Notes (markdown + color)
- `POST /api/admin/guides/lessons/:lessonId/notes`
- `PATCH /api/admin/guides/lessons/:lessonId/notes/:noteId`
- `DELETE /api/admin/guides/lessons/:lessonId/notes/:noteId`

Body:

```json
{
  "content_markdown": "# Important\nText...",
  "color": "blue"
}
```

Allowed colors:
- `blue`, `green`, `orange`, `red`, `purple`, `pink`

### 6.6 Lesson PDFs
- `GET /api/admin/guides/lessons/:lessonId/pdfs`
- `POST /api/admin/guides/lessons/:lessonId/pdfs` (multipart/form-data)
- `GET /api/admin/guides/lessons/:lessonId/pdfs/:pdfId/file`
- `DELETE /api/admin/guides/lessons/:lessonId/pdfs/:pdfId`

Upload fields:
- `title` (required)
- `file` (required, PDF, max 20MB)

### 6.7 Assignments (text only)
- `GET /api/admin/guides/lessons/:lessonId/assignments`
- `POST /api/admin/guides/lessons/:lessonId/assignments`
- `PATCH /api/admin/guides/lessons/:lessonId/assignments/:assignmentId`
- `DELETE /api/admin/guides/lessons/:lessonId/assignments/:assignmentId`

Body:

```json
{
  "assignment_text": "Write 20 sentences about this topic"
}
```

### 6.8 Vocabulary (multiple formats)
#### 6.8.1 Item-by-item vocabulary
- `GET /api/admin/guides/lessons/:lessonId/vocabulary`
- `POST /api/admin/guides/lessons/:lessonId/vocabulary`
- `PATCH /api/admin/guides/lessons/:lessonId/vocabulary/:vocabId`
- `DELETE /api/admin/guides/lessons/:lessonId/vocabulary/:vocabId`

Body:

```json
{
  "word": "usually",
  "translation": "often",
  "example": "I usually wake up early"
}
```

Vocabulary item response includes:
- `speak_text` (same value as `word`)

#### 6.8.2 Vocabulary PDFs
- `GET /api/admin/guides/lessons/:lessonId/vocabulary-pdfs`
- `POST /api/admin/guides/lessons/:lessonId/vocabulary-pdfs` (multipart/form-data)
- `GET /api/admin/guides/lessons/:lessonId/vocabulary-pdfs/:pdfId/file`
- `DELETE /api/admin/guides/lessons/:lessonId/vocabulary-pdfs/:pdfId`

Upload fields:
- `title` (required)
- `file` (required, PDF, max 20MB)

#### 6.8.3 Vocabulary images
- `GET /api/admin/guides/lessons/:lessonId/vocabulary-images`
- `POST /api/admin/guides/lessons/:lessonId/vocabulary-images` (multipart/form-data)
- `GET /api/admin/guides/lessons/:lessonId/vocabulary-images/:imageId/file`
- `DELETE /api/admin/guides/lessons/:lessonId/vocabulary-images/:imageId`

Upload fields:
- `title` (required)
- `file` (required, `image/*`, max 10MB)

#### 6.8.4 Vocabulary markdown blocks
- `GET /api/admin/guides/lessons/:lessonId/vocabulary-markdowns`
- `POST /api/admin/guides/lessons/:lessonId/vocabulary-markdowns`
- `PATCH /api/admin/guides/lessons/:lessonId/vocabulary-markdowns/:markdownId`
- `DELETE /api/admin/guides/lessons/:lessonId/vocabulary-markdowns/:markdownId`

Body:

```json
{
  "content_markdown": "# Vocabulary block\n- word - translation"
}
```

### 6.9 Videos
- `GET /api/admin/guides/lessons/:lessonId/videos`
- `POST /api/admin/guides/lessons/:lessonId/videos`
- `DELETE /api/admin/guides/lessons/:lessonId/videos/:videoId`

Body:

```json
{
  "title": "Present Simple video",
  "youtube_url": "https://www.youtube.com/watch?v=abc123"
}
```

Response includes:
- `youtube_video_id`
- `embed_url` (`https://www.youtube.com/embed/<id>`)

### 6.10 Speech settings (per user)
- `GET /api/admin/guides/speech-settings`
- `PATCH /api/admin/guides/speech-settings`

Body:

```json
{
  "speech_rate": 1.25
}
```

Range:
- `0.5` to `2.0`

---

## 7. Teacher APIs (read-only)

### 7.1 Levels
- `GET /api/teacher/guides/levels`
- `GET /api/teacher/guides/levels/:levelId`
- `GET /api/teacher/guides/levels/:levelId/main-pdf`
- `GET /api/teacher/guides/levels/:levelId/main-pdf/file`
- `GET /api/teacher/guides/levels/:levelId/lessons`

### 7.2 Lesson detail and content
- `GET /api/teacher/guides/lessons/:lessonId`
- `GET /api/teacher/guides/lessons/:lessonId/pdfs`
- `GET /api/teacher/guides/lessons/:lessonId/pdfs/:pdfId/file`
- `GET /api/teacher/guides/lessons/:lessonId/assignments`
- `GET /api/teacher/guides/lessons/:lessonId/vocabulary`
- `GET /api/teacher/guides/lessons/:lessonId/vocabulary-pdfs`
- `GET /api/teacher/guides/lessons/:lessonId/vocabulary-pdfs/:pdfId/file`
- `GET /api/teacher/guides/lessons/:lessonId/vocabulary-images`
- `GET /api/teacher/guides/lessons/:lessonId/vocabulary-images/:imageId/file`
- `GET /api/teacher/guides/lessons/:lessonId/vocabulary-markdowns`
- `GET /api/teacher/guides/lessons/:lessonId/videos`
- `GET /api/teacher/guides/speech-settings`
- `PATCH /api/teacher/guides/speech-settings`

---

## 8. Validation Rules
- Level: `title` and `description` are required.
- Lesson: `topic_name` is required.
- Note: `content_markdown` is required.
- Assignment: `assignment_text` is required.
- Lesson/vocabulary PDF: PDF only, max 20MB.
- Vocabulary image: image only, max 10MB.
- YouTube URL must be valid YouTube format (`watch`, `youtu.be`, `embed`, `shorts`).
- `speech_rate` must be between `0.5` and `2.0`.

## 9. Frontend Integration Tip
Use the composite endpoint as the main source for lesson tabs:
- `GET /api/{role}/guides/lessons/:lessonId`

After any admin create/update/delete action, refetch this endpoint to keep UI synced.
