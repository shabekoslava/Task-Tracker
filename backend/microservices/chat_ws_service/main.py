# backend/microservices/chat_ws_service/main.py
import os
import asyncio
import json
import traceback
from typing import List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Chat & WebSocket Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"🔌 WebSocket клиент подключен. Всего активных: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"❌ WebSocket клиент отключен. Всего активных: {len(self.active_connections)}")

    async def broadcast(self, message: dict, exclude: WebSocket = None):
        for connection in self.active_connections:
            if connection != exclude:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            # Рассылаем локально
            await manager.broadcast(data, exclude=websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"⚠️ Ошибка в WebSocket сессии: {e}")
        manager.disconnect(websocket)

# =============================================================================
# Фоновый обработчик сообщений из Kafka (Consumer)
# =============================================================================
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS")
consumer_task = None

async def kafka_consumer_loop():
    if not KAFKA_BOOTSTRAP_SERVERS:
        print("ℹ️ Переменная KAFKA_BOOTSTRAP_SERVERS не задана. Работаем в локальном режиме без Kafka.")
        return

    # Задержка перед стартом, чтобы Kafka успела подняться в Docker
    await asyncio.sleep(5)
    
    print(f"🎧 Попытка подключения Kafka Consumer к {KAFKA_BOOTSTRAP_SERVERS}...")
    while True:
        consumer = None
        try:
            from aiokafka import AIOKafkaConsumer
            consumer = AIOKafkaConsumer(
                "board-updates",
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                group_id="chat-ws-group",
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                auto_offset_reset="latest",
                request_timeout_ms=10000,
                session_timeout_ms=10000
            )
            await consumer.start()
            print("⚡ Kafka Consumer успешно запущен и слушает топик board-updates!")
            
            try:
                async for msg in consumer:
                    event = msg.value
                    print(f"📥 Получено событие из Kafka: {event}")
                    # Рассылаем всем активным WebSocket-соединениям на этом сервере
                    await manager.broadcast(event)
            except Exception as inner_e:
                print(f"⚠️ Ошибка во время чтения топика Kafka: {inner_e}")
                
        except Exception as e:
            print(f"⚠️ Ошибка подключения к Kafka (переподключение через 5 сек): {e}")
        finally:
            if consumer:
                try:
                    await consumer.stop()
                except Exception:
                    pass
            await asyncio.sleep(5)

@app.on_event("startup")
async def startup():
    global consumer_task
    consumer_task = asyncio.create_task(kafka_consumer_loop())
    print("🚀 Chat WebSocket Service запущен!")

@app.on_event("shutdown")
async def shutdown():
    global consumer_task
    if consumer_task:
        consumer_task.cancel()
        print("🛑 Фоновый Kafka Consumer остановлен.")
