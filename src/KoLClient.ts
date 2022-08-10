import axios from "axios";
import { Agent as httpsAgent } from "https";
import { Agent as httpAgent } from "http";
import { stringify } from "querystring";
import { Mutex } from "async-mutex";

const mutex = new Mutex();

axios.defaults.timeout = 30000;
axios.defaults.httpAgent = new httpAgent({ keepAlive: true });
axios.defaults.httpsAgent = new httpsAgent({ keepAlive: true });

type KOLCredentials = {
  sessionCookies: string;
  pwdhash: string;
};

export type KoLUser = {
  name: string;
  id: string;
};

type KoLChatMessage = {
  who?: KoLUser;
  type?: string;
  msg?: string;
  link?: string;
  channel?: string;
  time: string;
};

type KoLKmail = {
  id: string;
  type: string;
  fromid: string;
  fromname: string;
  azunixtime: string;
  message: string;
  localtime: string;
};

export enum MessageType {
  Whisper = "whisper",
  KMail = "kmail",
  Chat = "chat",
}

export type IncomingMessage = {
  who: KoLUser;
  msg: string;
  type: MessageType;
  reply: (message: string) => Promise<void>;
};

export class KoLClient {
  private _loginParameters;
  private _credentials?: KOLCredentials;
  private _lastFetchedMessages: string = "0";
  private _isRollover: boolean = false;

  constructor(username: string, password: string) {
    this._loginParameters = new URLSearchParams();
    this._loginParameters.append("loggingin", "Yup.");
    this._loginParameters.append("loginname", username);
    this._loginParameters.append("password", password);
    this._loginParameters.append("secure", "0");
    this._loginParameters.append("submitbutton", "Log In");
  }

  async loggedIn(): Promise<boolean> {
    if (!this._credentials) return false;
    try {
      const apiResponse = await axios(
        "https://www.kingdomofloathing.com/api.php",
        {
          maxRedirects: 0,
          withCredentials: true,
          headers: {
            cookie: this._credentials?.sessionCookies || "",
          },
          params: {
            what: "status",
            for: `${this._loginParameters.get("loginname")} Chatbot`,
          },
          validateStatus: (status) => status === 302 || status === 200,
        }
      );
      return apiResponse.status === 200;
    } catch {
      console.log("Login check failed, returning false to be safe.");
      return false;
    }
  }

  async logIn(): Promise<boolean> {
    return mutex.runExclusive(async () => {
      if (await this.loggedIn()) return true;
      if (this._isRollover) return false;
      console.log(
        `Not logged in. Logging in as ${this._loginParameters.get("loginname")}`
      );
      try {
        const loginResponse = await axios(
          "https://www.kingdomofloathing.com/login.php",
          {
            method: "POST",
            data: this._loginParameters,
            maxRedirects: 0,
            validateStatus: (status) => status === 302,
          }
        );
        const sessionCookies = loginResponse.headers["set-cookie"]
          .map((cookie: string) => cookie.split(";")[0])
          .join("; ");
        const apiResponse = await axios(
          "https://www.kingdomofloathing.com/api.php",
          {
            withCredentials: true,
            headers: {
              cookie: sessionCookies,
            },
            params: {
              what: "status",
              for: `${this._loginParameters.get("loginname")} Chatbot`,
            },
          }
        );
        this._credentials = {
          sessionCookies: sessionCookies,
          pwdhash: apiResponse.data.pwd,
        };
        return true;
      } catch {
        console.log("Login failed. Checking if it's because of rollover.");
        await this.rolloverCheck();
        return false;
      }
    });
  }

  async rolloverCheck() {
    this._isRollover =
      /The system is currently down for nightly maintenance/.test(
        (await axios("https://www.kingdomofloathing.com/")).data
      );
    if (this._isRollover) {
      console.log(
        "Rollover appears to be in progress. Checking again in one minute."
      );
      setTimeout(() => this.rolloverCheck(), 60000);
    }
  }

  async visitUrl(
    url: string,
    parameters: Record<string, any> = {},
    data: Record<string, any> | undefined = undefined,
    pwd: Boolean = true,
    doLog: Boolean = false
  ): Promise<any> {
    if (this._isRollover || !(await this.logIn())) return null;
    try {
      const page = await axios(`https://www.kingdomofloathing.com/${url}`, {
        method: "POST",
        withCredentials: true,
        headers: {
          cookie: this._credentials?.sessionCookies || "",
        },
        params: {
          ...parameters,
          ...(pwd ? { pwd: this._credentials?.pwdhash } : {}),
        },
        ...(data
          ? {
              data: stringify(data),
            }
          : {}),
      });
      if (doLog) console.log(page.request);
      return page.data;
    } catch {
      return null;
    }
  }

  async useChatMacro(macro: string): Promise<void> {
    await this.visitUrl("submitnewchat.php", {
      graf: `/clan ${macro}`,
      j: 1,
    });
  }

  async sendChatMessage(channel: string, message: string): Promise<void> {
    await this.visitUrl("submitnewchat.php", {
      graf: `/${channel} ${message}`,
      j: 1,
    });
  }

  async sendWhisper(recipientId: number, message: string): Promise<void> {
    await this.useChatMacro(`/w ${recipientId} ${message}`);
  }

  async sendKmail(recipientId: number, message: string): Promise<void> {
    await this.visitUrl("sendmessage.php", {
      action: "send",
      j: 1,
      towho: recipientId,
      contact: 0,
      message: message,
      howmany1: 1,
      whichitem1: 0,
      sendmeat: 0,
    });
  }

  async sendGift(
    recipientId: number,
    message: string,
    insideMessage: string,
    meat: number = 0,
    itemId: number = 0,
    itemQuantity: number = 0
  ): Promise<void> {
    await this.visitUrl("town_sendgift.php", {
      towho: recipientId,
      contact: 0,
      note: message,
      insidenote: insideMessage,
      whichpackage: 1,
      fromwhere: 0,
      howmany1: itemQuantity,
      whichitem1: itemId,
      sendmeat: meat,
      action: " Yep.",
    });
  }

  async fetchNewChats(): Promise<IncomingMessage[]> {
    const newChatMessagesResponse = await this.visitUrl("newchatmessages.php", {
      j: 1,
      lasttime: this._lastFetchedMessages,
    });
    if (!newChatMessagesResponse) return [];
    this._lastFetchedMessages = newChatMessagesResponse["last"];
    const newWhispers: IncomingMessage[] = newChatMessagesResponse["msgs"]
      .filter(
        (msg: KoLChatMessage) => msg["type"] === "private" && msg.who && msg.msg
      )
      .map((msg: KoLChatMessage) => ({
        who: msg.who as KoLUser,
        msg: msg.msg as string,
        type: MessageType.Whisper,
        reply: async (message: string) =>
          await this.sendWhisper(parseInt((msg.who as KoLUser).id), message),
      }));
    const newChats: IncomingMessage[] = newChatMessagesResponse["msgs"]
      .filter(
        (msg: KoLChatMessage) =>
          msg["type"] === "public" &&
          msg.who &&
          msg.who.name &&
          msg.who.name !== this._loginParameters.get("loginname") &&
          msg.msg &&
          msg.channel
      )
      .map((msg: KoLChatMessage) => ({
        who: msg.who as KoLUser,
        msg: msg.msg as string,
        channel: msg.channel as string,
        type: MessageType.Chat,
        reply: async (message: string) =>
          await this.sendChatMessage(msg.channel as string, message),
      }));
    return newWhispers.concat(newChats);
  }

  async fetchNewKmails(): Promise<IncomingMessage[]> {
    const newKmailsResponse: KoLKmail[] = await this.visitUrl("api.php", {
      what: "kmail",
      for: `${this._loginParameters.get("loginname")} Chatbot`,
    });
    if (!newKmailsResponse.length) return [];
    const newKmails: IncomingMessage[] = newKmailsResponse.map(
      (msg: KoLKmail) => ({
        who: {
          id: msg.fromid,
          name: msg.fromname,
        },
        msg: msg.message,
        type: MessageType.KMail,
        reply: async (message: string) =>
          await this.sendKmail(parseInt(msg.fromid), message),
      })
    );
    const body = {
      the_action: "delete",
      pwd: this._credentials?.pwdhash,
      box: "Inbox",
      ...newKmailsResponse.reduce(
        (acc: { [x: string]: string }, msg: KoLKmail) => ({
          ...acc,
          [`sel${msg.id}`]: "on",
        }),
        {}
      ),
    };
    await this.visitUrl("messages.php", {}, body);
    return newKmails;
  }
}
