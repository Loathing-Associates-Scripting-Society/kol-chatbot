import { KoLClient, IncomingMessage } from "./KoLClient";

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class KoLBot {
  private _client: KoLClient;

  constructor(username: string, password: string) {
    this._client = new KoLClient(username, password);
  }

  start(cb: (message: IncomingMessage) => any) {
    this.loop(cb);
  }

  async sendMessage(channel: string, message: string) {
    await this._client.sendChatMessage(channel, message);
  }

  async sendWhisper(recipientId: number, message: string) {
    await this._client.sendWhisper(recipientId, message);
  }

  async sendKmail(recipientId: number, message: string) {
    await this._client.sendKmail(recipientId, message);
  }

  async sendGift(
    recipientId: number,
    message: string,
    insideMessage: string,
    meat: number,
    itemId: number,
    itemQuantity: number
  ) {
    await this._client.sendGift(
      recipientId,
      message,
      insideMessage,
      meat,
      itemId,
      itemQuantity
    );
  }

  async sendMeat(
    recipientId: number,
    meat: number,
    message = "Here's some meat!",
    insideMessage = "Feel free to spend it all in one place!"
  ) {
    await this._client.sendGift(
      recipientId,
      message,
      insideMessage,
      meat,
      0,
      0
    );
  }

  async sendItem(
    recipientId: number,
    itemId: number,
    itemQuantity: number,
    message = "Here's a thing!",
    insideMessage = "Enjoy!"
  ) {
    await this._client.sendGift(
      recipientId,
      message,
      insideMessage,
      0,
      itemId,
      itemQuantity
    );
  }

  async joinChannel(channel: string) {
    await this._client.useChatMacro(`/listenon ${channel}`);
  }

  async joinChannels(channels: string[]) {
    await Promise.all(channels.map((channel) => this.joinChannel(channel)));
  }

  async leaveChannel(channel: string) {
    await this._client.useChatMacro(`/listenoff ${channel}`);
  }

  async leaveChannels(channels: string[]) {
    await Promise.all(channels.map((channel) => this.leaveChannel(channel)));
  }

  private async loop(cb: (message: IncomingMessage) => any) {
    const messages = await Promise.all([
      this._client.fetchNewChats(),
      this._client.fetchNewKmails(),
    ]);
    await Promise.all(messages.flatMap((msg) => msg).map((msg) => cb(msg)));
    await wait(3000);
    await this.loop(cb);
  }
}
