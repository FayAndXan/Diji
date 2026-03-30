// Slim companion_message tool — replaces 109-param built-in message tool
// Uses runtime channel helpers, not internal tool invocation
// Supports: send (text + buttons) and react (emoji) for any channel

export default {
  id: 'companion-message',
  name: 'Companion Message',
  description: 'Slim message proxy tool for companion agents.',
  
  register(api) {
    api.registerTool((ctx) => ({
      name: 'companion_message',
      description: 'Send messages or react with emoji. For send: provide message text. For react: provide emoji and messageId. Target and channel auto-resolve from current conversation.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['send', 'react'],
            description: 'send = send message. react = react to message with emoji.'
          },
          target: {
            type: 'string',
            description: 'Chat/user ID. Auto-resolves from current conversation if omitted.'
          },
          message: {
            type: 'string',
            description: 'Message text (for send).'
          },
          emoji: {
            type: 'string',
            description: 'Emoji for reaction (for react). e.g. 👀 💪 🔥 🤍'
          },
          messageId: {
            type: 'string',
            description: 'Message ID to react to (for react).'
          },
          channel: {
            type: 'string',
            description: 'Channel override (telegram, whatsapp, etc). Auto-resolves if omitted.'
          }
        },
        required: ['action']
      },

      async execute(_toolCallId, params) {
        const cfg = ctx.runtimeConfig ?? ctx.config ?? api.config;
        const action = (params.action ?? 'send').toLowerCase();

        // Resolve channel from params or ambient context
        const channel = (
          params.channel ??
          ctx.deliveryContext?.channel ??
          ctx.messageChannel ??
          ''
        ).trim().toLowerCase();

        const target = (params.target ?? ctx.deliveryContext?.to ?? '').trim();
        const accountId = ctx.deliveryContext?.accountId ?? ctx.agentAccountId;
        const threadId = ctx.deliveryContext?.threadId;

        if (!channel) {
          throw new Error('No channel resolved. Pass channel param or ensure ambient route exists.');
        }

        if (action === 'send') {
          const text = (params.message ?? '').trim();
          if (!text) throw new Error('message is required for action=send.');
          if (!target) throw new Error('target is required (or ambient deliveryContext.to must exist).');

          const adapter = await api.runtime.channel.outbound.loadAdapter(channel);
          if (!adapter?.sendText) {
            throw new Error(`Channel '${channel}' has no sendText outbound adapter.`);
          }
          
          await adapter.sendText({
            cfg,
            to: target,
            text,
            ...(accountId ? { accountId } : {}),
            ...(threadId != null ? { threadId } : {}),
          });

          return { content: [{ type: 'text', text: 'sent' }] };
        }

        if (action === 'react') {
          if (!params.emoji) throw new Error('emoji is required for action=react.');
          
          // Try to use the channel adapter for reactions
          const adapter = await api.runtime.channel.outbound.loadAdapter(channel);
          
          // Telegram reactions
          if (channel === 'telegram' && adapter?.setMessageReaction) {
            const msgId = params.messageId ?? ctx.deliveryContext?.messageId;
            if (!msgId) throw new Error('messageId is required for react (or must be in delivery context).');
            
            await adapter.setMessageReaction({
              cfg,
              chatId: target || ctx.deliveryContext?.to,
              messageId: msgId,
              emoji: params.emoji,
              ...(accountId ? { accountId } : {}),
            });
            return { content: [{ type: 'text', text: 'reacted' }] };
          }
          
          // Discord reactions
          if (channel === 'discord' && api.runtime?.channel?.discord?.reactMessageDiscord) {
            const msgId = params.messageId ?? ctx.deliveryContext?.messageId;
            if (!msgId) throw new Error('messageId is required for react.');
            
            const channelId = target.startsWith('channel:') ? target.slice('channel:'.length) : target;
            await api.runtime.channel.discord.reactMessageDiscord(
              channelId, msgId, params.emoji,
              { cfg, ...(accountId ? { accountId } : {}) }
            );
            return { content: [{ type: 'text', text: 'reacted' }] };
          }

          // Fallback: try generic adapter react
          if (adapter?.react) {
            const msgId = params.messageId ?? ctx.deliveryContext?.messageId;
            await adapter.react({
              cfg,
              to: target || ctx.deliveryContext?.to,
              messageId: msgId,
              emoji: params.emoji,
              ...(accountId ? { accountId } : {}),
            });
            return { content: [{ type: 'text', text: 'reacted' }] };
          }

          throw new Error(`react not supported for channel '${channel}' — adapter has no reaction method.`);
        }

        throw new Error(`Unsupported action: ${action}`);
      },
    }));
  },
};
