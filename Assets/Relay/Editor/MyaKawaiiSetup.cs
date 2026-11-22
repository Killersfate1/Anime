using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Relay.Studio
{
    /// <summary>
    /// Non-destructive Kawaii setup for a user-imported GLB scene instance.
    /// Does not replace, delete, or overwrite the original Relay preview.
    /// </summary>
    public static class MyaKawaiiSetup
    {
        private const string Pack = "Assets/KAWAII_ANIMATIOMS_100/Assets/Animations/";
        private const string Generated = "Assets/UserAssets/Generated/";
        private static readonly (string state, string filename)[] StateClips =
        {
            ("Idle", "@KA_Idle01_breathing.FBX"),
            ("LookAround", "@KA_Idle02_LookLeftAndRight.FBX"),
            ("Waiting", "@KA_Idle09_Waiting.FBX"),
            ("Stretch", "@KA_Idle05_Stretch.FBX"),
            ("Talk", "@KA_Idle50_StandingTalk1_1.FBX"),
            ("Think", "@KA_Idle08_ComeUpWithAnIdea.FBX"),
            ("Cheer", "@KA_Idle36_Yay.FBX"),
            ("Shy", "@KA_Idle18_Shy.FBX"),
            ("Surprised", "@KA_Idle29_Surprised.FBX"),
            ("Concerned", "@KA_Idle67_FeelDown.FBX"),
            ("Laugh", "@KA_Idle28_Laugh.FBX"),
            ("Wave", "@KA_Idle45_WaveHandSlightly.FBX")
        };

        [MenuItem("Relay/Mya/Configure Selected GLB with Kawaii Animations")]
        private static void Configure()
        {
            var root = Selection.activeGameObject;
            if (!root || !root.scene.IsValid())
            {
                EditorUtility.DisplayDialog("Mya", "Select Mya's imported GLB instance in the active scene first.", "OK");
                return;
            }

            var clips = new Dictionary<string, AnimationClip>();
            var missing = new List<string>();
            foreach (var item in StateClips)
            {
                string path = Pack + item.filename;
                var clip = AssetDatabase.LoadAllAssetsAtPath(path)
                    .OfType<AnimationClip>()
                    .FirstOrDefault(x => !x.name.StartsWith("__preview__", StringComparison.OrdinalIgnoreCase));
                if (!clip) missing.Add(path);
                else clips.Add(item.state, clip);
            }
            if (missing.Count > 0)
            {
                EditorUtility.DisplayDialog("Mya: animations missing",
                    "The Kawaii pack was found in the GitHub repository, but these imported clips are missing here:\n" +
                    string.Join("\n", missing), "OK");
                return;
            }

            Animator animator = root.GetComponentInChildren<Animator>(true);
            if (!animator) animator = Undo.AddComponent<Animator>(root);
            Avatar avatar = animator.avatar;
            bool createdAvatar = false;

            if (!avatar || !avatar.isValid || !avatar.isHuman)
            {
                // The uploaded GLB is skinned, but does not contain a VRM
                // humanoid mapping. Build Unity's Avatar using its original
                // bone names rather than replacing the user's character.
                avatar = BuildHumanoidFromGlbBones(root);
                if (!avatar || !avatar.isValid || !avatar.isHuman)
                {
                    if (avatar) UnityEngine.Object.DestroyImmediate(avatar);
                    EditorUtility.DisplayDialog("Mya: manual rig check required",
                        "The GLB skeleton could not yet be validated as Humanoid. No avatar replacement was made. " +
                        "Check the bone orientation, proportions, and import hierarchy in Unity before retargeting.", "OK");
                    return;
                }
                createdAvatar = true;
            }

            Directory.CreateDirectory(Generated);
            AssetDatabase.Refresh();

            if (createdAvatar)
            {
                string avatarPath = AssetDatabase.GenerateUniqueAssetPath(Generated + "MyaHumanoid.asset");
                AssetDatabase.CreateAsset(avatar, avatarPath);
                Undo.RecordObject(animator, "Assign Mya Humanoid Avatar");
                animator.avatar = avatar;
            }

            string controllerPath = AssetDatabase.GenerateUniqueAssetPath(Generated + "MyaKawaii.controller");
            var controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            var machine = controller.layers[0].stateMachine;
            foreach (var item in StateClips)
            {
                var state = machine.AddState(item.state);
                state.motion = clips[item.state];
                state.writeDefaultValues = true;
                if (item.state == "Idle") machine.defaultState = state;
            }

            Undo.RecordObject(animator, "Assign Mya Kawaii Controller");
            animator.runtimeAnimatorController = controller;
            animator.applyRootMotion = false;
            var behaviour = root.GetComponent<MyaKawaiiBehaviour>();
            if (!behaviour) behaviour = Undo.AddComponent<MyaKawaiiBehaviour>(root);
            Undo.RecordObject(behaviour, "Connect Mya Kawaii Behaviour");
            behaviour.animator = animator;
            behaviour.observationEnabled = false;

            EditorUtility.SetDirty(animator);
            EditorUtility.SetDirty(behaviour);
            EditorSceneManager.MarkSceneDirty(root.scene);
            AssetDatabase.SaveAssets();
            Debug.Log("MYA_KAWAII_SETUP: assigned " + clips.Count + " Kawaii animation states to the selected imported avatar. " +
                      "Screen observation is OFF. Controller: " + controllerPath);
        }

        [MenuItem("Relay/Mya/Validate Selected Mya Rig")]
        private static void Validate()
        {
            var root = Selection.activeGameObject;
            if (!root) { Debug.LogWarning("MYA: select a character in the Hierarchy."); return; }
            var animator = root.GetComponentInChildren<Animator>(true);
            var skins = root.GetComponentsInChildren<SkinnedMeshRenderer>(true);
            int morphTargets = skins.Sum(s => s.sharedMesh ? s.sharedMesh.blendShapeCount : 0);
            Debug.Log("MYA_RIG_AUDIT: skinned meshes=" + skins.Length +
                      ", blendshapes=" + morphTargets +
                      ", humanoid=" + (animator && animator.avatar && animator.avatar.isHuman && animator.avatar.isValid) +
                      ", controller=" + (animator && animator.runtimeAnimatorController ? animator.runtimeAnimatorController.name : "none") +
                      ". Without face blendshapes or jaw bones, phoneme lip sync requires additional rigging.");
        }

        // Known names were inspected from the uploaded GLB. Mappings are
        // intentionally explicit: Unity must reject a bad rig rather than
        // silently driving broken poses.
        private static readonly (string human, string prefix)[] BoneMap =
        {
            ("Hips", "Pelvis_"), ("Spine", "Stomach_"), ("Chest", "Chest_"),
            ("Neck", "Neck_"), ("Head", "Head_"),
            ("LeftUpperLeg", "Thigh.l_"), ("LeftLowerLeg", "Lowerleg.l_"),
            ("LeftFoot", "Foot.l_"), ("LeftToes", "toe.l_"),
            ("RightUpperLeg", "Thigh.r_"), ("RightLowerLeg", "Lowerleg.r_"),
            ("RightFoot", "Foot.r_"), ("RightToes", "toe.r_"),
            ("LeftShoulder", "collar.l_"), ("LeftUpperArm", "upperarm.l_"),
            ("LeftLowerArm", "lowerarm.l_"), ("LeftHand", "palm.l_"),
            ("RightShoulder", "collar.r_"), ("RightUpperArm", "upperarm.r_"),
            ("RightLowerArm", "lowerarm.r_"), ("RightHand", "palm.r_"),
            ("Left Thumb Proximal", "ta.l_"), ("Left Thumb Intermediate", "tb.l_"),
            ("Left Thumb Distal", "tc.l_"),
            ("Right Thumb Proximal", "ta.r_"), ("Right Thumb Intermediate", "tb.r_"),
            ("Right Thumb Distal", "tc.r_"),
            ("Left Index Proximal", "f1a.l_"), ("Left Index Intermediate", "f1b.l_"),
            ("Left Index Distal", "f1c.l_"),
            ("Right Index Proximal", "f1a.r_"), ("Right Index Intermediate", "f1b.r_"),
            ("Right Index Distal", "f1c.r_"),
            ("Left Middle Proximal", "f2a.l_"), ("Left Middle Intermediate", "f2b.l_"),
            ("Left Middle Distal", "f2c.l_"),
            ("Right Middle Proximal", "f2a.r_"), ("Right Middle Intermediate", "f2b.r_"),
            ("Right Middle Distal", "f2c.r_"),
            ("Left Ring Proximal", "f3a.l_"), ("Left Ring Intermediate", "f3b.l_"),
            ("Left Ring Distal", "f3c.l_"),
            ("Right Ring Proximal", "f3a.r_"), ("Right Ring Intermediate", "f3b.r_"),
            ("Right Ring Distal", "f3c.r_"),
            ("Left Little Proximal", "f4a.l_"), ("Left Little Intermediate", "f4b.l_"),
            ("Left Little Distal", "f4c.l_"),
            ("Right Little Proximal", "f4a.r_"), ("Right Little Intermediate", "f4b.r_"),
            ("Right Little Distal", "f4c.r_")
        };

        private static Avatar BuildHumanoidFromGlbBones(GameObject root)
        {
            var transforms = root.GetComponentsInChildren<Transform>(true);
            var bones = new List<HumanBone>();
            var missingRequired = new List<string>();
            for (int i = 0; i < BoneMap.Length; i++)
            {
                var mapping = BoneMap[i];
                Transform match = transforms.FirstOrDefault(t => t.name.StartsWith(mapping.prefix, StringComparison.OrdinalIgnoreCase));
                // Core 18 major bones must all be present; fingers/toes may be optional.
                if (!match)
                {
                    if (i <= 20 && mapping.human != "LeftToes" && mapping.human != "RightToes")
                        missingRequired.Add(mapping.human);
                    continue;
                }
                bones.Add(new HumanBone
                {
                    humanName = mapping.human,
                    boneName = match.name,
                    limit = new HumanLimit { useDefaultValues = true }
                });
            }
            if (missingRequired.Count > 0)
            {
                Debug.LogError("MYA_RIG_MISSING: " + string.Join(", ", missingRequired));
                return null;
            }

            var skeleton = transforms.Select(t => new SkeletonBone
            {
                name = t.name,
                position = t.localPosition,
                rotation = t.localRotation,
                scale = t.localScale
            }).ToArray();

            var desc = new HumanDescription
            {
                human = bones.ToArray(),
                skeleton = skeleton,
                upperArmTwist = 0.5f, lowerArmTwist = 0.5f,
                upperLegTwist = 0.5f, lowerLegTwist = 0.5f,
                armStretch = 0.05f, legStretch = 0.05f, feetSpacing = 0f
            };

            try { return AvatarBuilder.BuildHumanAvatar(root, desc); }
            catch (Exception ex)
            {
                Debug.LogError("MYA_HUMANOID_BUILD_FAILED: " + ex.Message);
                return null;
            }
        }
    }
}
