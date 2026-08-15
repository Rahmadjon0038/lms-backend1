const {
  getAppVersion,
  getAllAppVersions,
  updateAppVersion: updateAppVersionModel,
} = require('../models/appVersionModel');

const ALLOWED_PLATFORMS = ['android', 'ios'];

// Ilova ochilganda chaqiradi — login qilinmagan bo'lsa ham ishlashi kerak,
// shuning uchun autentifikatsiyasiz.
exports.checkVersion = async (req, res) => {
  try {
    const platform = String(req.query.platform || '').toLowerCase();
    const currentBuildNumber = parseInt(req.query.build_number, 10);

    if (!ALLOWED_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        success: false,
        message: `platform faqat: ${ALLOWED_PLATFORMS.join(', ')}`,
      });
    }
    if (!Number.isInteger(currentBuildNumber) || currentBuildNumber <= 0) {
      return res.status(400).json({
        success: false,
        message: "build_number musbat butun son bo'lishi kerak",
      });
    }

    const info = await getAppVersion(platform);
    if (!info) {
      return res.json({
        success: true,
        data: { update_available: false, force_update: false },
      });
    }

    const latestBuildNumber = info.latest_build_number;
    const minSupportedBuildNumber = info.min_supported_build_number;

    const updateAvailable = currentBuildNumber < latestBuildNumber;
    const forceUpdate =
      minSupportedBuildNumber != null &&
      currentBuildNumber < minSupportedBuildNumber;

    res.json({
      success: true,
      data: {
        update_available: updateAvailable,
        force_update: forceUpdate,
        latest_version_name: info.latest_version_name,
        latest_build_number: latestBuildNumber,
        current_build_number: currentBuildNumber,
        message: info.update_message,
        store_url: info.store_url,
      },
    });
  } catch (error) {
    console.error('❌ App versiyasini tekshirishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message,
    });
  }
};

// Super admin uchun: barcha platformalar konfiguratsiyasini ko'rish
exports.listVersions = async (req, res) => {
  try {
    const versions = await getAllAppVersions();
    res.json({ success: true, data: versions });
  } catch (error) {
    console.error('❌ App versiyalarini olishda xatolik:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatoligi',
      error: error.message,
    });
  }
};

// Super admin uchun: bitta platforma sozlamalarini yangilash
// (masalan yangi versiya chiqqanda latest_build_number oshiriladi)
exports.updateVersion = async (req, res) => {
  try {
    const platform = String(req.params.platform || '').toLowerCase();
    if (!ALLOWED_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        success: false,
        message: `platform faqat: ${ALLOWED_PLATFORMS.join(', ')}`,
      });
    }

    const updated = await updateAppVersionModel(platform, req.body || {});
    res.json({
      success: true,
      message: 'App versiyasi sozlamalari yangilandi',
      data: updated,
    });
  } catch (error) {
    console.error('❌ App versiyasini yangilashda xatolik:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Yangilashda xatolik yuz berdi',
    });
  }
};
