const {
  createRoom,
  getAllRooms,
  getRoomById,
  getRoomByNumber,
  updateRoom,
  deleteRoom,
  checkRoomAvailability
} = require('../models/roomModel');

// 1. Xona yaratish (Admin)
exports.addRoom = async (req, res) => {
  try {
    const { room_number, capacity, has_projector, description } = req.body;

    if (!room_number || room_number.toString().trim() === '') {
      return res.status(400).json({ message: "Xona raqami kiritilishi shart!" });
    }

    if (!capacity || capacity <= 0) {
      return res.status(400).json({ message: "Xona sig'imi kiritilishi shart va 0 dan katta bo'lishi kerak!" });
    }

    // Xona raqami mavjudligini tekshirish
    const existingRoom = await getRoomByNumber(room_number.toString().trim());
    if (existingRoom) {
      return res.status(400).json({ message: "Bu xona raqami allaqachon mavjud!" });
    }

    const newRoom = await createRoom({
      room_number: room_number.toString().trim(),
      capacity: parseInt(capacity),
      has_projector: has_projector === true || has_projector === 'true',
      description: description ? description.trim() : null
    });

    res.status(201).json({
      success: true,
      message: "Xona muvaffaqiyatli qo'shildi",
      room: newRoom
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 2. Barcha xonalarni olish
exports.getRooms = async (req, res) => {
  try {
    const { is_available, has_projector } = req.query;
    
    const filters = {};
    if (is_available !== undefined) {
      filters.is_available = is_available === 'true';
    }
    if (has_projector !== undefined) {
      filters.has_projector = has_projector === 'true';
    }

    const rooms = await getAllRooms(filters);
    
    res.json({
      success: true,
      count: rooms.length,
      rooms
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 3. Bitta xonani olish
exports.getRoomDetails = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Noto'g'ri ID!" });
    }

    const room = await getRoomById(id);
    if (!room) {
      return res.status(404).json({ message: "Xona topilmadi" });
    }

    res.json({
      success: true,
      room
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 4. Xonani yangilash (Admin)
exports.updateRoom = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Noto'g'ri ID!" });
    }

    const existingRoom = await getRoomById(id);
    if (!existingRoom) {
      return res.status(404).json({ message: "Xona topilmadi" });
    }

    // Agar room_number o'zgartirilayotgan bo'lsa, dublikatni tekshirish
    if (req.body.room_number && req.body.room_number !== existingRoom.room_number) {
      const duplicate = await getRoomByNumber(req.body.room_number);
      if (duplicate) {
        return res.status(400).json({ message: "Bu xona raqami allaqachon mavjud!" });
      }
    }

    const updatedRoom = await updateRoom(id, req.body);

    res.json({
      success: true,
      message: "Xona ma'lumotlari yangilandi",
      room: updatedRoom
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 5. Xonani o'chirish (Admin)
exports.deleteRoom = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Noto'g'ri ID!" });
    }

    const deletedRoom = await deleteRoom(id);
    if (!deletedRoom) {
      return res.status(404).json({ message: "Xona topilmadi" });
    }

    res.json({
      success: true,
      message: "Xona o'chirildi",
      room: deletedRoom
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 6. Xona schedule bo'yicha band yoki yo'qligini tekshirish
exports.checkAvailability = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Noto'g'ri ID!" });
    }

    const { days, time } = req.body;
    
    if (!days || !Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ message: "Kunlar ro'yxati kiritilishi shart!" });
    }

    if (!time) {
      return res.status(400).json({ message: "Vaqt kiritilishi shart! (masalan: '14:00-16:00')" });
    }

    const room = await getRoomById(id);
    if (!room) {
      return res.status(404).json({ message: "Xona topilmadi" });
    }

    const availabilityCheck = await checkRoomAvailability(id, { days, time });

    if (availabilityCheck.isAvailable) {
      res.json({
        success: true,
        available: true,
        message: "Xona bu vaqtda bo'sh"
      });
    } else {
      res.json({
        success: true,
        available: false,
        message: "Xona bu vaqtda band",
        conflictGroup: availabilityCheck.conflictGroup
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
