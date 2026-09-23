-- 店家固定的會計/總務對接窗口。
-- 原本只能在每月稽核單（venue_monthly_audit.venue_contact）填，等於每月都要重填、也常被漏填；
-- 這裡加一個固定欄位，店家管理頁填一次就好。
ALTER TABLE venues ADD COLUMN IF NOT EXISTS finance_contact_name text;
