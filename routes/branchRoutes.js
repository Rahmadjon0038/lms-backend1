const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const { roleCheck } = require('../middlewares/roleMiddleware');
const { getBranches, createBranch, updateBranch } = require('../controllers/branchController');

const router = express.Router();

router.use(protect);
router.use(roleCheck(['super_admin']));

router.get('/', getBranches);
router.post('/', createBranch);
router.patch('/:id', updateBranch);

module.exports = router;
