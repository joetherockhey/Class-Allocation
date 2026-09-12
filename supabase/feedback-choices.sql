-- Two multiple-choice questions on the audience form. Additive, so it runs
-- against the live feedback table without touching what is already in it.
-- Re-runnable.
--
-- The stored values are slugs, not the wording on screen: the labels in
-- assets/feedback-stats.js can be reworded whenever. Adding or removing an
-- option means changing the constraint below to match.

alter table feedback add column if not exists recommend text;
alter table feedback add column if not exists best_bit  text;

alter table feedback drop constraint if exists feedback_recommend_check;
alter table feedback add  constraint feedback_recommend_check
  check (recommend is null or recommend in ('yes', 'maybe', 'no'));

alter table feedback drop constraint if exists feedback_best_bit_check;
alter table feedback add  constraint feedback_best_bit_check
  check (best_bit is null or best_bit in
    ('examples', 'tips', 'activity', 'questions', 'none'));
