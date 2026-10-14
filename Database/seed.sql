-- Import this file once after Database/database.sql has created the tables.
-- All sample accounts use the existing demo password hash from this project.

INSERT INTO Room
    (id, room_number, is_booked, price, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, electricity_unit_price, water_price)
VALUES
    (1, 101, FALSE, 3500.00, TRUE,  TRUE,  TRUE,  1, TRUE, TRUE, 8.00, 100.00),
    (2, 102, FALSE, 4000.00, TRUE,  TRUE,  TRUE,  2, TRUE, TRUE, 8.00, 100.00),
    (3, 103, FALSE, 3200.00, TRUE,  TRUE,  FALSE, 1, TRUE, TRUE, 8.00, 100.00),
    (4, 104, FALSE, 3000.00, FALSE, TRUE,  FALSE, 1, TRUE, FALSE, 8.00, 100.00),
    (5, 105, FALSE, 4500.00, TRUE,  TRUE,  TRUE,  2, TRUE, TRUE, 8.00, 100.00);

INSERT INTO Staff
    (id, role, idcard, password, phone, first_name, last_name, is_suspended, age)
VALUES
    (1, 'Staff', '1100200000101', '$2b$10$yrCvz3lU7x2R8YlhR7k8E.X4DMTmQdMKPrhWTPOVo5aSxYcVI.4Pu', '0844444444', 'มานะ', 'ทำงานดี', FALSE, 27),
    (2, 'Staff', '1100200000102', '$2b$10$yrCvz3lU7x2R8YlhR7k8E.X4DMTmQdMKPrhWTPOVo5aSxYcVI.4Pu', '0855555555', 'มานี', 'ขยันดี', FALSE, 24);

INSERT INTO Admin
    (id, role, idcard, password, phone, first_name, last_name, is_suspended, age)
VALUES
    (1, 'Admin', '1100200000201', '$2b$10$yrCvz3lU7x2R8YlhR7k8E.X4DMTmQdMKPrhWTPOVo5aSxYcVI.4Pu', '0866666666', 'ปิติ', 'ดูแลระบบ', FALSE, 35);

INSERT INTO Owner
    (id, role, idcard, password, phone, first_name, last_name, is_suspended, age)
VALUES
    (1, 'Owner', '1100200000301', '$2b$10$yrCvz3lU7x2R8YlhR7k8E.X4DMTmQdMKPrhWTPOVo5aSxYcVI.4Pu', '0877777777', 'เจ้าของ', 'หอพัก', FALSE, 45);
