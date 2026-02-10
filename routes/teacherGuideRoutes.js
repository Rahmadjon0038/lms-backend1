const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');
const guideController = require('../controllers/guideController');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Teacher Guide
 *     description: Guide API for admin and teacher
 */

router.use(protect);
router.use(roleCheck(['teacher', 'admin', 'super_admin']));

/**
 * @swagger
 * /api/teacher/guides/levels:
 *   get:
 *     summary: List levels
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/levels', guideController.getLevels);

/**
 * @swagger
 * /api/teacher/guides/levels/{levelId}:
 *   get:
 *     summary: Level detail (main pdf + lessons)
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/levels/:levelId', guideController.getLevelById);
router.get('/levels/:levelId/banner', guideController.streamLevelBanner);

/**
 * @swagger
 * /api/teacher/guides/levels/{levelId}/main-pdf:
 *   get:
 *     summary: Main PDF metadata
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/levels/:levelId/main-pdf', guideController.getLevelMainPdfMeta);

/**
 * @swagger
 * /api/teacher/guides/levels/{levelId}/main-pdf/file:
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
 * /api/teacher/guides/levels/{levelId}/lessons:
 *   get:
 *     summary: List lessons in level
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/levels/:levelId/lessons', guideController.getLevelLessons);

/**
 * @swagger
 * /api/teacher/guides/lessons/{lessonId}:
 *   get:
 *     summary: Lesson detail (notes, pdf, assignment, vocabulary, video)
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/lessons/:lessonId', guideController.getLessonDetail);

/**
 * @swagger
 * /api/teacher/guides/speech-settings:
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
 * /api/teacher/guides/lessons/{lessonId}/pdfs:
 *   get:
 *     summary: Lesson PDF list
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 * /api/teacher/guides/lessons/{lessonId}/pdfs/{pdfId}/file:
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
router.get('/lessons/:lessonId/pdfs', guideController.listLessonPdfs);
router.get('/lessons/:lessonId/pdfs/:pdfId/file', guideController.streamLessonPdfFile);

/**
 * @swagger
 * /api/teacher/guides/lessons/{lessonId}/assignments:
 *   get:
 *     summary: List lesson assignments
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 * /api/teacher/guides/lessons/{lessonId}/vocabulary:
 *   get:
 *     summary: List lesson vocabulary items
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 * /api/teacher/guides/lessons/{lessonId}/vocabulary-pdfs:
 *   get:
 *     summary: List lesson vocabulary PDFs
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 * /api/teacher/guides/lessons/{lessonId}/vocabulary-pdfs/{pdfId}/file:
 *   get:
 *     summary: Lesson vocabulary PDF stream
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 * /api/teacher/guides/lessons/{lessonId}/vocabulary-images:
 *   get:
 *     summary: List lesson vocabulary images
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 * /api/teacher/guides/lessons/{lessonId}/vocabulary-images/{imageId}/file:
 *   get:
 *     summary: Lesson vocabulary image stream
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 * /api/teacher/guides/lessons/{lessonId}/vocabulary-markdowns:
 *   get:
 *     summary: List lesson vocabulary markdown blocks
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 * /api/teacher/guides/lessons/{lessonId}/videos:
 *   get:
 *     summary: List lesson video links
 *     tags: [Teacher Guide]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: OK } }
 */
router.get('/lessons/:lessonId/assignments', guideController.listAssignments);
router.get('/lessons/:lessonId/vocabulary', guideController.listVocabularies);
router.get('/lessons/:lessonId/vocabulary-pdfs', guideController.listVocabularyPdfs);
router.get('/lessons/:lessonId/vocabulary-pdfs/:pdfId/file', guideController.streamVocabularyPdfFile);
router.get('/lessons/:lessonId/vocabulary-images', guideController.listVocabularyImages);
router.get('/lessons/:lessonId/vocabulary-images/:imageId/file', guideController.streamVocabularyImageFile);
router.get('/lessons/:lessonId/vocabulary-markdowns', guideController.listVocabularyMarkdowns);
router.get('/lessons/:lessonId/videos', guideController.listVideos);

module.exports = router;
