-- Shared no-login account for prototype mode (OPEN_ACCESS). It has no password/account row,
-- so it can never be used to sign in; it only owns records created without a session.
INSERT OR IGNORE INTO `users` (`id`, `name`, `email`, `email_verified`) VALUES ('guest', 'Gość', 'guest@guest.invalid', 0);
