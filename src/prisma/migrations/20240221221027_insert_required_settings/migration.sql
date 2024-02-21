-- Those settings are required to reach our endpoints, since no more using OpenAI (but having the code for test purposes), they look quite empty :)
INSERT INTO public."Settings"
("onlyTrueAsId", "llmBotAssistantId", "llmAnalyzerAssistantId")
VALUES(true, 'not_using_openai_here', 'not_using_openai_here');
