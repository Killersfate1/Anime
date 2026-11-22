using Convai.Runtime.Components;
using Convai.Runtime.Room;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Relay.Studio
{
    /// <summary>
    /// An explicit user action to bind Mya's character to the separately
    /// configured Convai demonstration. Never auto-connects or stores keys.
    /// </summary>
    public static class MyaConvaiBind
    {
        [MenuItem("Relay/Mya/Connect Selected Character to Convai Demo")]
        private static void BindSelected()
        {
            var root = Selection.activeGameObject;
            if (!root || !root.scene.IsValid())
            {
                EditorUtility.DisplayDialog("Mya", "Select your imported Mya character instance in the Hierarchy.", "OK");
                return;
            }

            var kawaii = root.GetComponent<MyaKawaiiBehaviour>();
            if (!kawaii || !kawaii.animator)
            {
                EditorUtility.DisplayDialog("Mya", "Configure the selected Mya GLB with Kawaii animations first.", "OK");
                return;
            }

            var manager = Object.FindFirstObjectByType<ConvaiManager>();
            if (!manager)
            {
                EditorUtility.DisplayDialog("Mya", "Open the separate Convai preview scene and configure the Convai SDK first. No cloud connection has been attempted.", "OK");
                return;
            }

            var character = root.GetComponent<ConvaiCharacter>();
            if (!character)
            {
                character = Undo.AddComponent<ConvaiCharacter>(root);
                character.Configure("", "Mya");
            }
            var serialized = new SerializedObject(character);
            var autoConnect = serialized.FindProperty("_autoConnect");
            if (autoConnect != null)
            {
                autoConnect.boolValue = false;
                serialized.ApplyModifiedPropertiesWithoutUndo();
            }

            var bridge = root.GetComponent<RelayConvaiCompanion>();
            if (!bridge) bridge = Undo.AddComponent<RelayConvaiCompanion>(root);
            Undo.RecordObject(bridge, "Connect Mya Convai Events");
            bridge.character = character;
            bridge.manager = manager;
            bridge.kawaiiMotion = kawaii;
            bridge.motion = null;
            // This is a separate demonstration scene. Only the selected
            // character should be subscribed to the Convai manager.
            manager.SetExplicitCharacters(new[] { character });
            EditorUtility.SetDirty(bridge);
            EditorUtility.SetDirty(character);
            EditorSceneManager.MarkSceneDirty(root.scene);
            Debug.Log("MYA_CONVAI_BRIDGE_READY: speech start/stop drives Mya's speaking animation. Explicit Connect to Convai (Cloud) is still required in Play Mode. No cloud call was made.");
        }
    }
}
