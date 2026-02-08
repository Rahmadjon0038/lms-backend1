const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');
const guideController = require('../controllers/guideController');

const router = express.Router();

const handleUploadError = (uploader, fieldName, tooLargeMessage = 'File size exceeds limit') => (req, res, next) => {
  uploader.single(fieldName)(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: tooLargeMessage,
        errors: { file: 'max_size_limit' },
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message || 'File upload failed',
      errors: {},
    });
  });
};

const handleMainPdfUpload = handleUploadError(guideController.uploadMainPdf, 'file', 'PDF size must not exceed 20MB');
const handleLessonPdfUpload = handleUploadError(guideController.uploadLessonPdf, 'file', 'PDF size must not exceed 20MB');
const handleVocabularyImageUpload = handleUploadError(guideController.uploadVocabularyImage, 'file', 'Image size must not exceed 10MB');

router.use(protect);
router.use(roleCheck(['admin', 'super_admin']));

/**
 * @swagger
 * /api/admin/guides/levels:
 *   get:
 *     summary: List levels (admin)
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   post:
 *     summary: Create level
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Created } }
 */
router.get('/levels', guideController.getLevels);
router.post('/levels', guideController.createLevel);

/**
 * @swagger
 * /api/admin/guides/levels/{levelId}:
 *   get:
 *     summary: Level detail (admin)
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   patch:
 *     summary: Update level
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   delete:
 *     summary: Delete level
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/levels/:levelId', guideController.getLevelById);
router.patch('/levels/:levelId', guideController.updateLevel);
router.delete('/levels/:levelId', guideController.deleteLevel);

/**
 * @swagger
 * /api/admin/guides/levels/{levelId}/main-pdf:
 *   post:
 *     summary: Level main PDF upload
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Created } }
 *   get:
 *     summary: Main PDF metadata
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   delete:
 *     summary: Delete main PDF
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.post('/levels/:levelId/main-pdf', handleMainPdfUpload, guideController.uploadLevelMainPdf);
router.get('/levels/:levelId/main-pdf', guideController.getLevelMainPdfMeta);
router.delete('/levels/:levelId/main-pdf', guideController.deleteLevelMainPdf);

/**
 * @swagger
 * /api/admin/guides/levels/{levelId}/main-pdf/file:
 *   get:
 *     summary: Protected main PDF stream
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 */
router.get('/levels/:levelId/main-pdf/file', guideController.streamLevelMainPdf);

/**
 * @swagger
 * /api/admin/guides/levels/{levelId}/lessons:
 *   post:
 *     summary: Create lesson in level
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Created } }
 */
router.post('/levels/:levelId/lessons', guideController.createLesson);

/**
 * @swagger
 * /api/admin/guides/levels/{levelId}/lessons/reorder:
 *   patch:
 *     summary: Reorder lessons (drag-drop)
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.patch('/levels/:levelId/lessons/reorder', guideController.reorderLessons);

/**
 * @swagger
 * /api/admin/guides/lessons/{lessonId}:
 *   get:
 *     summary: Lesson detail (notes, pdf, assignment, vocabulary, video)
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   patch:
 *     summary: Update lesson basic info
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   delete:
 *     summary: Delete lesson
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/lessons/:lessonId', guideController.getLessonDetail);
router.patch('/lessons/:lessonId', guideController.updateLesson);
router.delete('/lessons/:lessonId', guideController.deleteLesson);

/**
 * @swagger
 * /api/admin/guides/speech-settings:
 *   get:
 *     summary: Get current user speech settings
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   patch:
 *     summary: Update current user speech settings
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/speech-settings', guideController.getSpeechSettings);
router.patch('/speech-settings', guideController.updateSpeechSettings);

/**
 * @swagger
 * /api/admin/guides/lessons/{lessonId}/notes:
 *   post:
 *     summary: Create lesson note (markdown + color)
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Created } }
 */
router.post('/lessons/:lessonId/notes', guideController.createLessonNote);
router.patch('/lessons/:lessonId/notes/:noteId', guideController.updateLessonNote);
router.delete('/lessons/:lessonId/notes/:noteId', guideController.deleteLessonNote);

/**
 * @swagger
 * /api/admin/guides/lessons/{lessonId}/pdfs:
 *   get:
 *     summary: List lesson PDFs
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   post:
 *     summary: Lesson PDF upload
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Created } }
 */
router.get('/lessons/:lessonId/pdfs', guideController.listLessonPdfs);
router.post('/lessons/:lessonId/pdfs', handleLessonPdfUpload, guideController.uploadLessonPdfItem);

/**
 * @swagger
 * /api/admin/guides/lessons/{lessonId}/pdfs/{pdfId}/file:
 *   get:
 *     summary: Lesson PDF protected stream
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 */
router.get('/lessons/:lessonId/pdfs/:pdfId/file', guideController.streamLessonPdfFile);
router.delete('/lessons/:lessonId/pdfs/:pdfId', guideController.deleteLessonPdfItem);

/**
 * @swagger
 * /api/admin/guides/lessons/{lessonId}/assignments:
 *   get:
 *     summary: List assignments
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   post:
 *     summary: Create assignment
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Created } }
 * /api/admin/guides/lessons/{lessonId}/assignments/{assignmentId}:
 *   patch:
 *     summary: Update assignment
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   delete:
 *     summary: Delete assignment
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/lessons/:lessonId/assignments', guideController.listAssignments);
router.post('/lessons/:lessonId/assignments', guideController.createAssignment);
router.patch('/lessons/:lessonId/assignments/:assignmentId', guideController.updateAssignment);
router.delete('/lessons/:lessonId/assignments/:assignmentId', guideController.deleteAssignment);

/**
 * @swagger
 * /api/admin/guides/lessons/{lessonId}/vocabulary:
 *   get:
 *     summary: List vocabulary items
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   post:
 *     summary: Create vocabulary item
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Created } }
 * /api/admin/guides/lessons/{lessonId}/vocabulary/{vocabId}:
 *   patch:
 *     summary: Update vocabulary item
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   delete:
 *     summary: Delete vocabulary item
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/lessons/:lessonId/vocabulary', guideController.listVocabularies);
router.post('/lessons/:lessonId/vocabulary', guideController.createVocabulary);
router.patch('/lessons/:lessonId/vocabulary/:vocabId', guideController.updateVocabulary);
router.delete('/lessons/:lessonId/vocabulary/:vocabId', guideController.deleteVocabulary);

/**
 * @swagger
 * /api/admin/guides/lessons/{lessonId}/vocabulary-pdfs:
 *   get:
 *     summary: List vocabulary PDFs
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   post:
 *     summary: Upload vocabulary PDF
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Created } }
 * /api/admin/guides/lessons/{lessonId}/vocabulary-pdfs/{pdfId}/file:
 *   get:
 *     summary: Vocabulary PDF protected stream
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 * /api/admin/guides/lessons/{lessonId}/vocabulary-pdfs/{pdfId}:
 *   delete:
 *     summary: Delete vocabulary PDF
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/lessons/:lessonId/vocabulary-pdfs', guideController.listVocabularyPdfs);
router.post('/lessons/:lessonId/vocabulary-pdfs', handleLessonPdfUpload, guideController.uploadVocabularyPdf);
router.get('/lessons/:lessonId/vocabulary-pdfs/:pdfId/file', guideController.streamVocabularyPdfFile);
router.delete('/lessons/:lessonId/vocabulary-pdfs/:pdfId', guideController.deleteVocabularyPdf);

/**
 * @swagger
 * /api/admin/guides/lessons/{lessonId}/vocabulary-images:
 *   get:
 *     summary: List vocabulary images
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   post:
 *     summary: Upload vocabulary image
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Created } }
 * /api/admin/guides/lessons/{lessonId}/vocabulary-images/{imageId}/file:
 *   get:
 *     summary: Vocabulary image stream
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 * /api/admin/guides/lessons/{lessonId}/vocabulary-images/{imageId}:
 *   delete:
 *     summary: Delete vocabulary image
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/lessons/:lessonId/vocabulary-images', guideController.listVocabularyImages);
router.post('/lessons/:lessonId/vocabulary-images', handleVocabularyImageUpload, guideController.uploadVocabularyImageItem);
router.get('/lessons/:lessonId/vocabulary-images/:imageId/file', guideController.streamVocabularyImageFile);
router.delete('/lessons/:lessonId/vocabulary-images/:imageId', guideController.deleteVocabularyImage);

/**
 * @swagger
 * /api/admin/guides/lessons/{lessonId}/vocabulary-markdowns:
 *   get:
 *     summary: List vocabulary markdown blocks
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   post:
 *     summary: Create vocabulary markdown block
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Created } }
 * /api/admin/guides/lessons/{lessonId}/vocabulary-markdowns/{markdownId}:
 *   patch:
 *     summary: Update vocabulary markdown block
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   delete:
 *     summary: Delete vocabulary markdown block
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/lessons/:lessonId/vocabulary-markdowns', guideController.listVocabularyMarkdowns);
router.post('/lessons/:lessonId/vocabulary-markdowns', guideController.createVocabularyMarkdown);
router.patch('/lessons/:lessonId/vocabulary-markdowns/:markdownId', guideController.updateVocabularyMarkdown);
router.delete('/lessons/:lessonId/vocabulary-markdowns/:markdownId', guideController.deleteVocabularyMarkdown);

/**
 * @swagger
 * /api/admin/guides/lessons/{lessonId}/videos:
 *   get:
 *     summary: List video links
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 *   post:
 *     summary: Create YouTube video link
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Created } }
 * /api/admin/guides/lessons/{lessonId}/videos/{videoId}:
 *   delete:
 *     summary: Delete video link
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/lessons/:lessonId/videos', guideController.listVideos);
router.post('/lessons/:lessonId/videos', guideController.createVideo);
router.delete('/lessons/:lessonId/videos/:videoId', guideController.deleteVideo);

module.exports = router;
