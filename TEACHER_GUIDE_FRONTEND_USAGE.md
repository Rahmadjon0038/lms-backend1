# Teacher Guide Frontend Usage

This document describes how frontend should use all current Teacher/Admin Guide pages in English.

## 1. Auth
Send JWT in every request:

```http
Authorization: Bearer <token>
```

## 2. Base URLs
- Admin: `/api/admin/guides`
- Teacher: `/api/teacher/guides`

## 3. Level and Lesson Basics

### Create lesson
`POST /api/admin/guides/levels/:levelId/lessons`

```json
{ "topic_name": "Present Simple" }
```

### Update lesson
`PATCH /api/admin/guides/lessons/:lessonId`

```json
{ "topic_name": "Present Simple (updated)" }
```

## 4. Notes (no title)
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

## 5. Lesson PDFs (title + file)
- `POST /api/admin/guides/lessons/:lessonId/pdfs` (multipart/form-data)
- `GET /api/admin/guides/lessons/:lessonId/pdfs`
- `GET /api/teacher/guides/lessons/:lessonId/pdfs`
- `GET /api/{role}/guides/lessons/:lessonId/pdfs/:pdfId/file`
- `DELETE /api/admin/guides/lessons/:lessonId/pdfs/:pdfId`

Upload fields:
- `title` (required)
- `file` (required, PDF, max 20MB)

## 6. Assignments (text only)
- `POST /api/admin/guides/lessons/:lessonId/assignments`
- `PATCH /api/admin/guides/lessons/:lessonId/assignments/:assignmentId`
- `GET /api/{role}/guides/lessons/:lessonId/assignments`
- `DELETE /api/admin/guides/lessons/:lessonId/assignments/:assignmentId`

Body:
```json
{ "assignment_text": "Write 20 sentences about this topic" }
```

## 7. Vocabulary (3 input modes)
These 3 modes can be used together in the same lesson.

### 7.1 Item-by-item vocabulary
- `POST /api/admin/guides/lessons/:lessonId/vocabulary`
- `PATCH /api/admin/guides/lessons/:lessonId/vocabulary/:vocabId`
- `GET /api/{role}/guides/lessons/:lessonId/vocabulary`
- `DELETE /api/admin/guides/lessons/:lessonId/vocabulary/:vocabId`

```json
{
  "word": "usually",
  "translation": "odatda",
  "example": "I usually wake up early"
}
```

Vocabulary list/detail response now includes:
- `speak_text` (same as `word`, use this for text-to-speech)

### 7.2 Vocabulary images
- `POST /api/admin/guides/lessons/:lessonId/vocabulary-images` (multipart/form-data)
- `GET /api/{role}/guides/lessons/:lessonId/vocabulary-images`
- `GET /api/{role}/guides/lessons/:lessonId/vocabulary-images/:imageId/file`
- `DELETE /api/admin/guides/lessons/:lessonId/vocabulary-images/:imageId`

Upload fields:
- `title` (required)
- `file` (required, image/*, max 10MB)

### 7.3 Vocabulary markdown blocks
- `POST /api/admin/guides/lessons/:lessonId/vocabulary-markdowns`
- `PATCH /api/admin/guides/lessons/:lessonId/vocabulary-markdowns/:markdownId`
- `GET /api/{role}/guides/lessons/:lessonId/vocabulary-markdowns`
- `DELETE /api/admin/guides/lessons/:lessonId/vocabulary-markdowns/:markdownId`

```json
{
  "content_markdown": "# Vocabulary block\n- word - translation"
}
```

## 8. Videos
- `POST /api/admin/guides/lessons/:lessonId/videos`
- `GET /api/{role}/guides/lessons/:lessonId/videos`
- `DELETE /api/admin/guides/lessons/:lessonId/videos/:videoId`

```json
{
  "title": "Present Simple video",
  "youtube_url": "https://www.youtube.com/watch?v=abc123"
}
```

Use `embed_url` in iframe.

## 9. Main lesson endpoint for tabs
Use one request for page tabs:

`GET /api/{role}/guides/lessons/:lessonId`

Response includes:
- `lesson`
- `notes`
- `pdfs`
- `assignments`
- `vocabulary`
- `vocabulary_images`
- `vocabulary_markdowns`
- `videos`
- `speech_settings`

`speech_settings` format:
```json
{
  "speech_rate": 1,
  "min_rate": 0.5,
  "max_rate": 2,
  "updated_at": "2026-02-09T08:00:00.000Z"
}
```

## 10. Speech (Word Read Aloud + Speed)
Backend stores speed per user (works for both admin and teacher):
- `GET /api/{role}/guides/speech-settings`
- `PATCH /api/{role}/guides/speech-settings`

Update body:
```json
{ "speech_rate": 1.25 }
```

Allowed range:
- `0.5` to `2.0`

Frontend read-aloud flow:
1. Load `speech_settings` once on page open.
2. On vocabulary item speaker button click, read `item.speak_text` using browser Web Speech API.
3. Set `utterance.rate = speech_settings.speech_rate`.
4. When user changes speed slider/select, call `PATCH /speech-settings`.

Example:
```js
function speakWord(text, speechRate = 1) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = speechRate;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
```

## 11. Frontend flow
1. Open lesson page -> call lesson detail endpoint.
2. After any admin create/update/delete action -> refetch lesson detail.
3. Use `protected_file_url` for protected PDF/image streams.
4. Use `videos[].embed_url` for iframe.
5. For vocabulary speaker button use `item.speak_text` + `speech_settings.speech_rate`.

## 12. Common errors
- `topic_name is required`
- `content_markdown is required`
- `assignment_text is required`
- `title is required`
- `Only PDF files are allowed`
- `Only image files are allowed`
- `PDF size must not exceed 20MB`
- `Image size must not exceed 10MB`
- `speech_rate must be a number between 0.5 and 2.0`
