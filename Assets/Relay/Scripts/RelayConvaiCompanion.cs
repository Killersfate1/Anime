using System;
using System.Threading;
using Convai.Runtime.Components;
using Convai.Runtime.Room;
using UnityEngine;

namespace Relay.Studio
{
    public sealed class RelayConvaiCompanion : MonoBehaviour
    {
        public ConvaiCharacter character;
        public ConvaiManager manager;
        public CompanionPreview motion;
        public MyaKawaiiBehaviour kawaiiMotion;
        public string Status { get; private set; } = "Disconnected";
        public bool Connecting { get; private set; }
        private CancellationTokenSource connection;

        private void OnEnable()
        {
            if (!character) return;
            character.OnSpeechStarted += Speaking;
            character.OnSpeechStopped += Silent;
        }
        private void Speaking()
        {
            if (motion) motion.speaking = true;
            if (kawaiiMotion) kawaiiMotion.SetSpeaking(true);
        }
        private void Silent()
        {
            if (motion) motion.speaking = false;
            if (kawaiiMotion) kawaiiMotion.SetSpeaking(false);
        }

        // Deliberately called only by an explicit user command, never Start or OnEnable.
        public async void ConnectCloud()
        {
            if (!Application.isPlaying || Connecting || !character || !manager) return;
            if (string.IsNullOrWhiteSpace(character.CharacterId)) { Status = "Character ID required"; return; }
            connection?.Cancel(); connection?.Dispose();
            var current = new CancellationTokenSource(TimeSpan.FromSeconds(30)); connection = current;
            Connecting = true; Status = "Connecting to Convai";
            try
            {
                await manager.SetConversationInputModeAsync(ConversationInputMode.HandsFree, current.Token).AsTask();
                await character.StartConversationAsync(current.Token).AsTask();
                current.Token.ThrowIfCancellationRequested();
                character.EnableRemoteAudio(); manager.EnableAudioAndStartListening();
                Status = "Connected to Convai";
            }
            catch (OperationCanceledException) { Status = "Connection cancelled or timed out"; await manager.DisconnectAsync().AsTask(); }
            catch (Exception) { Status = "Connection failed; check Convai settings and Console"; await manager.DisconnectAsync().AsTask(); }
            finally { if (connection == current) { connection = null; Connecting = false; } current.Dispose(); }
        }
        public async void DisconnectCloud()
        {
            connection?.Cancel();
            try { if (manager) await manager.DisconnectAsync().AsTask(); }
            catch (Exception) { Debug.LogWarning("Convai disconnect failed; stop Play Mode to release the session."); }
            Silent(); Status = "Disconnected";
        }
        private void OnDisable()
        {
            if (character) { character.OnSpeechStarted -= Speaking; character.OnSpeechStopped -= Silent; }
            Silent();
            if (Application.isPlaying) DisconnectCloud();
        }
    }
}
