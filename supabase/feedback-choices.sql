-- The pick-one questions on the audience form. Additive, so it runs against
-- the live feedback table without touching what is already in it. Re-runnable.
--
-- The stored values are slugs, not the wording on screen: the labels in
-- assets/feedback-stats.js can be reworded whenever. Adding or removing an
-- option means changing the constraint below to match.
--
-- Every question is pick-one. The 0-10 slider columns (useful, clear,
-- engaging, confident) and `recommend` are from the earlier version of the
-- form and are no longer written to; they stay nullable so the rows collected
-- under them are still readable.

alter table feedback add column if not exists recommend  text;
alter table feedback add column if not exists best_bit   text;
alter table feedback add column if not exists study_help text;
alter table feedback add column if not exists belonging  text;
alter table feedback add column if not exists teamwork   text;

alter table feedback drop constraint if exists feedback_recommend_check;
alter table feedback add  constraint feedback_recommend_check
  check (recommend is null or recommend in ('yes', 'maybe', 'no'));

-- "Compared with before today's session, I interacted with others to give or
-- receive study help"
alter table feedback drop constraint if exists feedback_study_help_check;
alter table feedback add  constraint feedback_study_help_check
  check (study_help is null or study_help in
    ('strongly_disagree', 'disagree', 'same', 'agree', 'strongly_agree'));

-- "...how much do you feel part of the Business School student community?"
-- 'not_sure' is an opt-out rather than a point on the scale.
alter table feedback drop constraint if exists feedback_belonging_check;
alter table feedback add  constraint feedback_belonging_check
  check (belonging is null or belonging in
    ('much_less', 'little_less', 'same', 'little_more', 'much_more', 'not_sure'));

-- "...I think I understand much better what teamwork requires of me"
alter table feedback drop constraint if exists feedback_teamwork_check;
alter table feedback add  constraint feedback_teamwork_check
  check (teamwork is null or teamwork in
    ('strongly_disagree', 'disagree', 'same', 'agree', 'strongly_agree'));

-- "What was the most useful part?" - gained 'facilitators'.
alter table feedback drop constraint if exists feedback_best_bit_check;
alter table feedback add  constraint feedback_best_bit_check
  check (best_bit is null or best_bit in
    ('examples', 'facilitators', 'tips', 'activity', 'questions', 'none'));
