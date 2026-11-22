using UnityEngine;

namespace Relay.Studio
{
    public sealed class CompanionPreview : MonoBehaviour
    {
        [Range(0, 2)] public float motionIntensity = 1.3f;
        public bool speaking;
        public Transform head;
        public Transform leftArm;
        public Transform rightArm;
        private Quaternion headRest, leftRest, rightRest;

        private void OnEnable()
        {
            if (head) headRest = head.localRotation;
            if (leftArm) leftRest = leftArm.localRotation;
            if (rightArm) rightRest = rightArm.localRotation;
        }
        private void Update()
        {
            float t = Time.time;
            float gesture = speaking ? (0.5f + 0.5f * Mathf.Sin(t * 2.5f)) * 22f : 0;
            if (head) head.localRotation = headRest * Quaternion.Euler(Mathf.Sin(t * 1.2f) * 3 * motionIntensity, Mathf.Sin(t * 0.6f) * 7 * motionIntensity, Mathf.Sin(t * 0.8f) * 3 * motionIntensity);
            if (leftArm) leftArm.localRotation = leftRest * Quaternion.Euler((-gesture + Mathf.Sin(t) * 3) * motionIntensity, 0, -gesture * 0.5f * motionIntensity);
            if (rightArm) rightArm.localRotation = rightRest * Quaternion.Euler((-gesture * 0.5f + Mathf.Sin(t + 1) * 3) * motionIntensity, 0, gesture * 0.3f * motionIntensity);
        }
        private void OnDisable()
        {
            if (head) head.localRotation = headRest;
            if (leftArm) leftArm.localRotation = leftRest;
            if (rightArm) rightArm.localRotation = rightRest;
        }
    }
}
