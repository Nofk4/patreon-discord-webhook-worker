export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error(JSON.stringify({
        message: "Erro interno do Worker",
        error: error instanceof Error ? error.message : String(error),
        path: new URL(request.url).pathname,
      }));
      return new Response("Erro interno do Worker.", { status: 500 });
    }
  },
};

async function handleRequest(request, env) {
  if (request.method === "GET") {
    return json({
      ok: true,
      service: "Patreon → Discord",
      webhookName: env.WEBHOOK_NAME || "Patreon Updates",
      roleConfigured: Boolean(env.DISCORD_ROLE_ID && env.DISCORD_ROLE_ID !== "CHANGE_ME"),
      vanityConfigured: Boolean(env.PATREON_VANITY && env.PATREON_VANITY !== "CHANGE_ME"),
      discordConfigured: Boolean(env.DISCORD_WEBHOOK_URL),
      patreonConfigured: Boolean(env.PATREON_WEBHOOK_SECRET),
    });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (
    !env.DISCORD_WEBHOOK_URL ||
    !env.DISCORD_ROLE_ID ||
    env.DISCORD_ROLE_ID === "CHANGE_ME" ||
    !env.PATREON_WEBHOOK_SECRET
  ) {
    return new Response("Worker ainda não está totalmente configurado.", { status: 503 });
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 1_000_000) {
    return new Response("Payload muito grande.", { status: 413 });
  }

  const event = request.headers.get("X-Patreon-Event");
  const signature = request.headers.get("X-Patreon-Signature");
  const rawBody = await request.text();

  if (!verifyPatreonSignature(rawBody, signature, env.PATREON_WEBHOOK_SECRET)) {
    console.error(JSON.stringify({ message: "Assinatura do Patreon inválida" }));
    return new Response("Assinatura inválida.", { status: 401 });
  }

  if (event !== "posts:publish") {
    return new Response("Evento ignorado.", { status: 200 });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("JSON inválido.", { status: 400 });
  }

  const attributes = body?.data?.attributes || {};
  const title = limit(cleanText(attributes.title) || "Novo post no Patreon!", 256);
  const postId = String(body?.data?.id || "").trim();
  const postUrl = buildPostUrl(
    attributes.url,
    title,
    postId,
    env.PATREON_VANITY
  );

  const discordMessage = {
    username: env.WEBHOOK_NAME || "Patreon Updates",
    content:
      `## [Check out on Patreon](${postUrl})\n` +
      `## ${escapeDiscordMarkdown(singleLine(title))} <@&${env.DISCORD_ROLE_ID}>`,
    allowed_mentions: { roles: [env.DISCORD_ROLE_ID] },
  };

  const rawDiscordUrl = String(env.DISCORD_WEBHOOK_URL).trim();
  const discordUrl = new URL(rawDiscordUrl);
  discordUrl.searchParams.set("wait", "true");

  const discordResponse = await fetch(discordUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(discordMessage),
  });

  if (!discordResponse.ok) {
    const errorText = await discordResponse.text();
    console.error(JSON.stringify({
      message: "Discord recusou a mensagem",
      status: discordResponse.status,
      response: errorText.slice(0, 500),
    }));
    return new Response("O Discord recusou a mensagem.", { status: 502 });
  }

  return new Response("Publicado no Discord.", { status: 200 });
}

function verifyPatreonSignature(rawBody, signature, secret) {
  if (!signature || !/^[a-f0-9]{32}$/i.test(signature)) return false;
  const expected = hmacMd5(rawBody, secret);
  const received = signature.toLowerCase();
  let difference = 0;
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  }
  return difference === 0;
}

function hmacMd5(message, secret) {
  const encoder = new TextEncoder();
  let key = encoder.encode(secret);
  if (key.length > 64) key = md5(key);

  const innerPad = new Uint8Array(64);
  const outerPad = new Uint8Array(64);
  for (let index = 0; index < 64; index++) {
    const value = key[index] || 0;
    innerPad[index] = value ^ 0x36;
    outerPad[index] = value ^ 0x5c;
  }

  const messageBytes = encoder.encode(message);
  const innerInput = concatenateBytes(innerPad, messageBytes);
  const innerHash = md5(innerInput);
  const outerInput = concatenateBytes(outerPad, innerHash);
  return bytesToHex(md5(outerInput));
}

function md5(bytes) {
  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const constants = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
  );
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = BigInt(bytes.length) * 8n;
  for (let index = 0; index < 8; index++) {
    padded[paddedLength - 8 + index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(16);
    for (let index = 0; index < 16; index++) {
      const start = offset + index * 4;
      words[index] =
        (padded[start] |
          (padded[start + 1] << 8) |
          (padded[start + 2] << 16) |
          (padded[start + 3] << 24)) >>> 0;
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let index = 0; index < 64; index++) {
      let value;
      let wordIndex;
      if (index < 16) {
        value = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        value = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        value = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        value = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }

      const sum = (a + value + constants[index] + words[wordIndex]) >>> 0;
      const rotated = ((sum << shifts[index]) | (sum >>> (32 - shifts[index]))) >>> 0;
      a = d;
      d = c;
      c = b;
      b = (b + rotated) >>> 0;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const result = new Uint8Array(16);
  [a0, b0, c0, d0].forEach((word, wordIndex) => {
    for (let byteIndex = 0; byteIndex < 4; byteIndex++) {
      result[wordIndex * 4 + byteIndex] = (word >>> (byteIndex * 8)) & 0xff;
    }
  });
  return result;
}

function concatenateBytes(first, second) {
  const result = new Uint8Array(first.length + second.length);
  result.set(first, 0);
  result.set(second, first.length);
  return result;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function singleLine(value) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeDiscordMarkdown(value) {
  return value.replace(/([\\`*_~[\]<>])/g, "\\$1");
}

function safeHttpsUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function buildPostUrl(receivedUrl, title, postId, vanityValue) {
  const validReceivedUrl = safeHttpsUrl(receivedUrl);
  if (validReceivedUrl && new URL(validReceivedUrl).pathname.includes("/posts/")) {
    return validReceivedUrl;
  }

  const vanity = cleanVanity(vanityValue);
  if (postId && vanity) {
    const slug = slugify(title) || "post";
    return `https://www.patreon.com/${encodeURIComponent(vanity)}/posts/${slug}-${encodeURIComponent(postId)}`;
  }
  if (postId) return `https://www.patreon.com/posts/${encodeURIComponent(postId)}`;
  if (vanity) return `https://www.patreon.com/${encodeURIComponent(vanity)}/posts`;
  return "https://www.patreon.com/posts";
}

function cleanVanity(value) {
  if (typeof value !== "string" || value === "CHANGE_ME") return "";
  return value.trim().replace(/^@/, "").replace(/^\/+|\/+$/g, "");
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

function limit(value, maximum) {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1).trim()}…`;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
  });
}
