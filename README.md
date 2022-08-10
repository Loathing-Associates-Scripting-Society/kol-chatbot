# kol-chatbot

A Typescript and Vanilla Node library for creating Kingdom of Loathing chatbots quickly and easily!

To get started quickly, all you need to do is create an instance of KoLBot, giving it the username and password of a literate Kingdom of Loathing account with an associated email address (without these, it is unable to access chat, which somewhat defeats the purpose of a chatbot), then invoke .start on it providing a callback that will be run on incoming kmails, chat messages, and whispers.

Basic usage:

```
import {KoLBot} from "kol-chatbot";

const chatbot = new KoLBot("username", "P@ssw0rd")
chatbot.start(console.log)
```
