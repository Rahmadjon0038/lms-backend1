-- Fanlar uchun test ma'lumotlar
INSERT INTO subjects (name, price) VALUES 
('Matematik', 350000.00),
('Fizika', 400000.00),
('Ingliz tili', 300000.00),
('Informatika', 450000.00),
('Kimyo', 380000.00)
ON CONFLICT DO NOTHING;