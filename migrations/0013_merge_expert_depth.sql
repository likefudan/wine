-- 专业 merged into 进阶 (2026-11-18): the 进阶 form is now the full WSET form.
UPDATE tastings SET depth = 'standard' WHERE depth = 'expert';
UPDATE users SET depth = 'standard' WHERE depth = 'expert';
