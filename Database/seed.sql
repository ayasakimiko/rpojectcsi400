INSERT INTO Room
    (room_number, is_booked, price, air_conditioner, wifi, refrigerator, bed, bathroom, cctv, electricity_unit_price, water_price, rental_duration_months, rental_start_date, rental_end_date, prepaid_until)
VALUES
    (101, TRUE,  3500.00, TRUE,  TRUE,  TRUE,  1, TRUE, TRUE, 8.00, 100.00, 6,  '2026-01-01', '2026-07-01', '2026-02-01'),
    (102, TRUE,  4000.00, TRUE,  TRUE,  TRUE,  2, TRUE, TRUE, 8.00, 100.00, 12, '2026-02-01', '2027-02-01', '2026-03-01'),
    (103, TRUE,  3200.00, TRUE,  TRUE,  FALSE, 1, TRUE, TRUE, 8.00, 100.00, 6,  '2026-03-01', '2026-09-01', '2026-04-01'),
    (104, FALSE, 3000.00, FALSE, TRUE,  FALSE, 1, TRUE, FALSE, 8.00, 100.00, NULL, NULL, NULL, NULL),
    (105, FALSE, 4500.00, TRUE,  TRUE,  TRUE,  2, TRUE, TRUE, 8.00, 100.00, NULL, NULL, NULL, NULL);

INSERT INTO Customer
    (role, idcard, password, phone, first_name, last_name, is_suspended, age, room_number, deposit_amount)
VALUES
    ('Customer', '1100200000001', '$2b$10$quq9T.u2RdJ3zXDS1/ud0edZcozu4..Mxg4y4u98WvRhM6J90pGBG', '0811111111', 'สมชาย',   'ใจดี',     FALSE, 25, 101, 3500.00),
    ('Customer', '1100200000002', '$2b$10$quq9T.u2RdJ3zXDS1/ud0edZcozu4..Mxg4y4u98WvRhM6J90pGBG', '0822222222', 'สมหญิง',  'รักเรียน', FALSE, 28, 102, 4000.00),
    ('Customer', '1100200000003', '$2b$10$quq9T.u2RdJ3zXDS1/ud0edZcozu4..Mxg4y4u98WvRhM6J90pGBG', '0833333333', 'วิชัย',   'มั่นคง',   FALSE, 30, 103, 3200.00);

INSERT INTO Staff
    (role, idcard, password, phone, first_name, last_name, is_suspended, age)
VALUES
    ('Staff', '1100200000101', '$2b$10$quq9T.u2RdJ3zXDS1/ud0edZcozu4..Mxg4y4u98WvRhM6J90pGBG', '0844444444', 'มานะ', 'ทำงานดี', FALSE, 27),
    ('Staff', '1100200000102', '$2b$10$quq9T.u2RdJ3zXDS1/ud0edZcozu4..Mxg4y4u98WvRhM6J90pGBG', '0855555555', 'มานี',  'ขยันดี',  FALSE, 24);

INSERT INTO Admin
    (role, idcard, password, phone, first_name, last_name, is_suspended, age)
VALUES
    ('Admin', '1100200000201', '$2b$10$quq9T.u2RdJ3zXDS1/ud0edZcozu4..Mxg4y4u98WvRhM6J90pGBG', '0866666666', 'ปิติ', 'ดูแลระบบ', FALSE, 35);

INSERT INTO Owner
    (role, idcard, password, phone, first_name, last_name, is_suspended, age)
VALUES
    ('Owner', '1100200000301', '$2b$10$quq9T.u2RdJ3zXDS1/ud0edZcozu4..Mxg4y4u98WvRhM6J90pGBG', '0877777777', 'เจ้าของ', 'หอพัก', FALSE, 45);
