export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

export const POST = async (request: Request) => {
  const endpoint = "https://api.layercode.com/v1/agents/web/authorize_session";
  const apiKey = process.env.LAYERCODE_API_KEY;
  if (!apiKey) {
    throw new Error("LAYERCODE_API_KEY is not set.");
  }
  const requestBody = await request.json();
  if (!requestBody || !requestBody.agent_id) {
    throw new Error("Missing agent_id in request body.");
  }

  // Pass through npcId in session_context if provided
  const bodyToSend = {
    ...requestBody,
    session_context: {
      ...(requestBody.session_context || {}),
      npc_id: requestBody.npc_id || 'elder_oak'
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(bodyToSend),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
    }
    return NextResponse.json(await response.json());
  } catch (error: any) {
    console.log("Layercode authorize session response error:", error.message);

    if (error.message && error.message.includes('insufficient_balance')) {
      return NextResponse.json(
        { error: 'insufficient_balance' },
        { status: 402, statusText: 'insufficient_balance' }
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};
