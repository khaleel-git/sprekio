-- seed.sql (Small proof of concept dataset)
DELETE FROM senses;
DELETE FROM forms;
DELETE FROM lemmas;

-- 1. Simple nouns: Haus / Häuser
INSERT INTO lemmas (id, lemma, language, part_of_speech, gender, frequency, source) 
VALUES ('l_haus', 'Haus', 'de', 'Noun', 'das', 0.9, 'poc');

INSERT INTO forms (id, lemma_id, surface, normalized, grammatical_info) VALUES 
('f_haus_1', 'l_haus', 'Haus', 'haus', 'Nominative singular'),
('f_haus_2', 'l_haus', 'Häuser', 'häuser', 'Nominative plural'),
('f_haus_3', 'l_haus', 'Häusern', 'häusern', 'Dative plural');

INSERT INTO senses (id, lemma_id, translation, definition, frequency) VALUES 
('s_haus_1', 'l_haus', 'house', 'A building for human habitation', 0.95),
('s_haus_2', 'l_haus', 'home', 'The place where one lives', 0.05);

-- 2. Verb conjugations: gehen
INSERT INTO lemmas (id, lemma, language, part_of_speech, gender, frequency, source) 
VALUES ('l_gehen', 'gehen', 'de', 'Verb', NULL, 0.95, 'poc');

INSERT INTO forms (id, lemma_id, surface, normalized, grammatical_info) VALUES 
('f_gehen_1', 'l_gehen', 'gehen', 'gehen', 'Infinitive'),
('f_gehen_2', 'l_gehen', 'geht', 'geht', '3rd person singular present'),
('f_gehen_3', 'l_gehen', 'ging', 'ging', '1st/3rd person singular preterite'),
('f_gehen_4', 'l_gehen', 'gingen', 'gingen', '1st/3rd person plural preterite'),
('f_gehen_5', 'l_gehen', 'gegangen', 'gegangen', 'Past participle');

INSERT INTO senses (id, lemma_id, translation, definition, frequency) VALUES 
('s_gehen_1', 'l_gehen', 'to go', 'To move from one place to another', 0.8),
('s_gehen_2', 'l_gehen', 'to walk', 'To move on foot', 0.2);

-- 3. Multiple meanings: ziehen
INSERT INTO lemmas (id, lemma, language, part_of_speech, gender, frequency, source) 
VALUES ('l_ziehen', 'ziehen', 'de', 'Verb', NULL, 0.85, 'poc');

INSERT INTO forms (id, lemma_id, surface, normalized, grammatical_info) VALUES 
('f_ziehen_1', 'l_ziehen', 'ziehen', 'ziehen', 'Infinitive'),
('f_ziehen_2', 'l_ziehen', 'zieht', 'zieht', '3rd person singular present'),
('f_ziehen_3', 'l_ziehen', 'zog', 'zog', '1st/3rd person singular preterite'),
('f_ziehen_4', 'l_ziehen', 'gezogen', 'gezogen', 'Past participle');

INSERT INTO senses (id, lemma_id, translation, definition, frequency) VALUES 
('s_ziehen_1', 'l_ziehen', 'to pull', 'To exert force upon so as to cause motion toward the force', 0.6),
('s_ziehen_2', 'l_ziehen', 'to move (residence)', 'To change one''s place of residence', 0.3),
('s_ziehen_3', 'l_ziehen', 'to draw', 'To produce a picture or diagram', 0.1);
