INSERT INTO Room
    (room_number, is_booked, price, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, electricity_unit_price, water_price, rental_duration_months, rental_start_date, rental_end_date, prepaid_until)
VALUES
    (101, FALSE, 3500.00, TRUE,  TRUE,  TRUE,  1, TRUE, TRUE, 8.00, 100.00, NULL, NULL, NULL, NULL),
    (102, FALSE, 4000.00, TRUE,  TRUE,  TRUE,  2, TRUE, TRUE, 8.00, 100.00, NULL, NULL, NULL, NULL),
    (103, FALSE, 3200.00, TRUE,  TRUE,  FALSE, 1, TRUE, TRUE, 8.00, 100.00, NULL, NULL, NULL, NULL),
    (104, FALSE, 3000.00, FALSE, TRUE,  FALSE, 1, TRUE, FALSE, 8.00, 100.00, NULL, NULL, NULL, NULL),
    (105, FALSE, 4500.00, TRUE,  TRUE,  TRUE,  2, TRUE, TRUE, 8.00, 100.00, NULL, NULL, NULL, NULL);

INSERT INTO Staff
    (role, idcard, password, phone, first_name, last_name, is_suspended, age)
VALUES
    ('Staff', '1100200000101', '$2b$10$qMWpWUdFOqo8TXKtjhMujOFGYhYxjiVW8w.SjAfhc9zP8kivpZFM2', '0844444444', 'มานะ', 'ทำงานดี', FALSE, 27),
    ('Staff', '1100200000102', '$2b$10$qMWpWUdFOqo8TXKtjhMujOFGYhYxjiVW8w.SjAfhc9zP8kivpZFM2', '0855555555', 'มานี',  'ขยันดี',  FALSE, 24);

INSERT INTO Admin
    (role, idcard, password, phone, first_name, last_name, is_suspended, age)
VALUES
    ('Admin', '1100200000201', '$2b$10$qMWpWUdFOqo8TXKtjhMujOFGYhYxjiVW8w.SjAfhc9zP8kivpZFM2', '0866666666', 'ปิติ', 'ดูแลระบบ', FALSE, 35);

INSERT INTO Owner
    (role, idcard, password, phone, first_name, last_name, is_suspended, age)
VALUES
    ('Owner', '1100200000301', '$2b$10$qMWpWUdFOqo8TXKtjhMujOFGYhYxjiVW8w.SjAfhc9zP8kivpZFM2', '0877777777', 'เจ้าของ', 'หอพัก', FALSE, 45);
