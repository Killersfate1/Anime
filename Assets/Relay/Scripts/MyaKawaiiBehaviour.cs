using System;
using UnityEngine;

namespace Relay.Studio
{
    /// <summary>
    /// Presentation-only companion controller. It never captures a screen, opens a
    /// microphone or calls an AI provider. Trusted Relay services may supply
    /// observed events and voice state through the public methods.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class MyaKawaiiBehaviour : MonoBehaviour
    {
        public enum Mood { Neutral, Happy, Shy, Curious, Surprised, Concerned, Playful }

        [Header("Canonical user avatar")]
        public Animator animator;

        [Header("Privacy and attention")]
        public bool observationEnabled;
        public bool quietMode;
        public bool userSpeaking;
        public bool userConcentrating;
        public bool listening;
        public bool speaking;

        [Header("Initiative")]
        [Range(0f, 1f)] public float initiative = 0.45f;
        [Range(0f, 1f)] public float minimumConfidence = 0.72f;
        [Min(5f)] public float minimumReactionInterval = 28f;
        [Min(0.05f)] public float crossfadeSeconds = 0.22f;

        [Header("State")]
        public Mood currentMood = Mood.Neutral;

        /// <summary>Raised when a verified event qualifies for a possible
        /// comment. Subscribers decide whether to produce speech.</summary>
        public event Action<string> CommentCandidate;

        private float nextIdleAt;
        private float nextReactionAt;
        private float actionEndsAt;
        private string currentState;

        private void Awake()
        {
            if (!animator) animator = GetComponentInChildren<Animator>(true);
            nextIdleAt = Time.unscaledTime + 3f;
        }

        private void OnEnable()
        {
            nextIdleAt = Time.unscaledTime + 3f;
        }

        private void Update()
        {
            if (!animator || !animator.isActiveAndEnabled || !animator.runtimeAnimatorController)
                return;

            if (speaking)
            {
                Play("Talk");
                return;
            }

            if (Time.unscaledTime < actionEndsAt) return;

            if (listening)
            {
                Play("Think");
                return;
            }

            if (Time.unscaledTime < nextIdleAt) return;

            float roll = UnityEngine.Random.value;
            if (roll < 0.60f) Play("Idle");
            else if (roll < 0.82f) Play("LookAround");
            else if (roll < 0.94f) Play("Waiting");
            else Play("Stretch");

            nextIdleAt = Time.unscaledTime + UnityEngine.Random.Range(8f, 19f);
        }

        public void SetSpeaking(bool value)
        {
            if (speaking == value) return;
            speaking = value;
            if (value)
            {
                actionEndsAt = 0f;
                Play("Talk");
            }
            else
            {
                Play("Idle");
                nextIdleAt = Time.unscaledTime + 4f;
            }
        }

        public void SetListening(bool value)
        {
            listening = value;
            if (!speaking)
            {
                Play(value ? "Think" : "Idle");
                nextIdleAt = Time.unscaledTime + 4f;
            }
        }

        public void SetMood(Mood mood)
        {
            currentMood = mood;
            if (speaking) return;
            switch (mood)
            {
                case Mood.Happy: Gesture("Cheer", 2.4f); break;
                case Mood.Shy: Gesture("Shy", 2.4f); break;
                case Mood.Curious: Gesture("Think", 2.4f); break;
                case Mood.Surprised: Gesture("Surprised", 2.0f); break;
                case Mood.Concerned: Gesture("Concerned", 2.3f); break;
                case Mood.Playful: Gesture("Laugh", 2.2f); break;
                default: break;
            }
        }

        public void Greet()
        {
            if (!quietMode && !userConcentrating && !speaking)
                Gesture("Wave", 2.2f);
        }

        /// <summary>
        /// Event signals must originate from an upstream, permission-gated
        /// observation system. The controller does not infer game state itself.
        /// Return true means "candidate accepted", not "speech was produced".
        /// </summary>
        public bool TryObserveEvent(string eventType, float confidence, float significance)
        {
            if (!observationEnabled || quietMode || userSpeaking || userConcentrating
                || speaking || listening || string.IsNullOrWhiteSpace(eventType)
                || Time.unscaledTime < nextReactionAt)
                return false;

            confidence = Mathf.Clamp01(confidence);
            significance = Mathf.Clamp01(significance);
            if (confidence < minimumConfidence) return false;

            // Significance remains dominant; user-set initiative adjusts the
            // acceptance threshold rather than forcing constant commentary.
            float score = significance * 0.68f + confidence * 0.25f + initiative * 0.07f;
            float threshold = Mathf.Lerp(0.86f, 0.56f, initiative);
            if (score < threshold) return false;

            string gesture;
            float seconds;
            switch (eventType.Trim().ToLowerInvariant())
            {
                case "victory":
                case "goal_completed": gesture = "Cheer"; seconds = 2.8f; currentMood = Mood.Happy; break;
                case "defeat":
                case "repeated_error": gesture = "Concerned"; seconds = 2.4f; currentMood = Mood.Concerned; break;
                case "surprise":
                case "unexpected_event": gesture = "Surprised"; seconds = 2.0f; currentMood = Mood.Surprised; break;
                case "funny_moment": gesture = "Laugh"; seconds = 2.2f; currentMood = Mood.Playful; break;
                case "interesting_discovery": gesture = "Think"; seconds = 2.2f; currentMood = Mood.Curious; break;
                default: return false;
            }

            nextReactionAt = Time.unscaledTime + minimumReactionInterval;
            Gesture(gesture, seconds);
            CommentCandidate?.Invoke(eventType);
            return true;
        }

        private void Gesture(string state, float seconds)
        {
            if (Play(state))
            {
                actionEndsAt = Time.unscaledTime + Mathf.Max(0.1f, seconds);
                nextIdleAt = actionEndsAt + UnityEngine.Random.Range(3f, 8f);
            }
        }

        private bool Play(string state)
        {
            if (!animator || !animator.runtimeAnimatorController) return false;
            string fullName = "Base Layer." + state;
            if (!animator.HasState(0, Animator.StringToHash(fullName))) return false;
            if (currentState == state && (state == "Talk" || state == "Think")) return true;
            currentState = state;
            animator.CrossFadeInFixedTime(fullName, crossfadeSeconds, 0);
            return true;
        }
    }
}
