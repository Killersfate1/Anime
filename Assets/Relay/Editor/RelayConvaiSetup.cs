using System.IO;
using Convai.Editor;
using Convai.Runtime.Components;
using Relay.Studio;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class RelayConvaiSetup
{
    public const string ScenePath = "Assets/Relay/Scenes/ConvaiPreview.unity";
    [MenuItem("Relay/Open Convai Preview")]
    public static void CreateOrOpen()
    {
        if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
        if (File.Exists(ScenePath)) { EditorSceneManager.OpenScene(ScenePath); return; }
        var scene = EditorSceneManager.OpenScene("Assets/Relay/Scenes/CompanionPreview.unity");
        // Work in a separate saved scene; never replace David's asset-authoring scene.
        EditorSceneManager.SaveScene(scene, ScenePath);
        ConvaiSceneSetupApi.BootstrapScene();
        var manager = Object.FindFirstObjectByType<ConvaiManager>();
        var player = new GameObject("David - Convai Player").AddComponent<ConvaiPlayer>();
        var playerData = new SerializedObject(player);
        playerData.FindProperty("_playerName").stringValue = "David"; playerData.ApplyModifiedPropertiesWithoutUndo();
        var motion = Object.FindFirstObjectByType<CompanionPreview>();
        if (!motion) throw new System.InvalidOperationException("Original Relay robot not found in preview.");
        var character = motion.gameObject.AddComponent<ConvaiCharacter>();
        character.Configure("", "Relay");
        var characterData = new SerializedObject(character);
        characterData.FindProperty("_autoConnect").boolValue = false; characterData.ApplyModifiedPropertiesWithoutUndo();
        var bridge = motion.gameObject.AddComponent<RelayConvaiCompanion>();
        bridge.character = character; bridge.manager = manager; bridge.motion = motion;
        manager.SetExplicitPlayer(player); manager.SetExplicitCharacters(new[] { character });
        if (Camera.main && !Camera.main.GetComponent<AudioListener>()) Camera.main.gameObject.AddComponent<AudioListener>();
        EditorSceneManager.SaveScene(scene, ScenePath); AssetDatabase.SaveAssets(); Selection.activeGameObject = motion.gameObject;
        Debug.Log("RELAY_CONVAI_PREPARED: separate scene, explicit cloud connection, no credentials or recording enabled.");
    }
    public static void Verify()
    {
        CreateOrOpen();
        var bridge = Object.FindFirstObjectByType<RelayConvaiCompanion>();
        if (!bridge || !bridge.character || !bridge.manager || !bridge.motion) throw new System.InvalidOperationException("Convai bridge references missing.");
        var data = new SerializedObject(bridge.character);
        if (data.FindProperty("_autoConnect").boolValue) throw new System.InvalidOperationException("Cloud auto-connect must be off.");
        Debug.Log("RELAY_CONVAI_CHECKS_PASS: SDK compiled, saved bridge references, auto-connect disabled. Cloud service not tested.");
    }
}

[CustomEditor(typeof(RelayConvaiCompanion))]
public sealed class RelayConvaiCompanionEditor : Editor
{
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();
        var bridge = (RelayConvaiCompanion)target;
        EditorGUILayout.LabelField("Connection", bridge.Status);
        using (new EditorGUI.DisabledScope(!Application.isPlaying || bridge.Connecting))
            if (GUILayout.Button("Connect to Convai (Cloud)")) bridge.ConnectCloud();
        using (new EditorGUI.DisabledScope(!Application.isPlaying))
            if (GUILayout.Button("Disconnect Convai")) bridge.DisconnectCloud();
        if (GUILayout.Button("Convai Project Settings")) SettingsService.OpenProjectSettings("Project/Convai SDK");
    }
    public override bool RequiresConstantRepaint() => Application.isPlaying;
}
