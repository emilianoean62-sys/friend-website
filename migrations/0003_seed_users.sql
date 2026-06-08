-- Admin user: admin@aniverse.app / admin123
INSERT INTO users (email, username, password_hash, role) VALUES
('admin@aniverse.app', 'admin', 'YHOi_wbbLMbWAiE9tgROpQ.v2BdaboK0znmji1mgmD9S8tgoYVBtIx_hBBcZKOAGgg', 'ADMIN');

-- Demo free user: demo@aniverse.app / demo123
INSERT INTO users (email, username, password_hash, role) VALUES
('demo@aniverse.app', 'demo', 'f3FUJaxq-RrZ15Gb0ySlOA.4fiJjCMqmMNlx88kJm_nwUBQdd6QkYBHOMaygxY_inQ', 'USER');

-- Demo premium user: premium@aniverse.app / demo123
INSERT INTO users (email, username, password_hash, role, premium_until) VALUES
('premium@aniverse.app', 'premiumfan', 'f3FUJaxq-RrZ15Gb0ySlOA.4fiJjCMqmMNlx88kJm_nwUBQdd6QkYBHOMaygxY_inQ', 'PREMIUM', datetime('now', '+365 days'));
