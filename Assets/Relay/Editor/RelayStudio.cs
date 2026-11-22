using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Relay.Studio;

public sealed class RelayStudio : EditorWindow
{
    private GameObject avatar;
    private AnimationClip animation;
    [MenuItem("Relay/Asset Studio")]
    public static void Open() { GetWindow<RelayStudio>("Relay Asset Studio"); }

    private void OnGUI()
    {
        EditorGUILayout.LabelField("Relay Asset Studio", EditorStyles.boldLabel);
        avatar = (GameObject)EditorGUILayout.ObjectField("Avatar prefab", avatar, typeof(GameObject), false);
        animation = (AnimationClip)EditorGUILayout.ObjectField("Animation clip", animation, typeof(AnimationClip), false);
        using (new EditorGUI.DisabledScope(!avatar))
        {
            if (GUILayout.Button("Place Avatar in Preview")) PlaceAvatar();
        }
        if (GUILayout.Button("Open Preview Scene") && EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) EditorSceneManager.OpenScene("Assets/Relay/Scenes/CompanionPreview.unity");
        if (GUILayout.Button("Open Exports Folder")) { Directory.CreateDirectory("Exports"); EditorUtility.RevealInFinder(Path.GetFullPath("Exports")); }
        if (GUILayout.Button("Open Workflow Guide")) EditorUtility.OpenWithDefaultApp(Path.GetFullPath("README.md"));
    }
    private void PlaceAvatar()
    {
        var instance = (GameObject)PrefabUtility.InstantiatePrefab(avatar);
        Undo.RegisterCreatedObjectUndo(instance, "Place Relay avatar");
        instance.transform.position = Vector3.zero;
        var animator = instance.GetComponentInChildren<Animator>();
        if (animator && animation)
        {
            string controllerPath = AssetDatabase.GenerateUniqueAssetPath("Assets/UserAssets/PreviewAnimation.controller");
            Directory.CreateDirectory("Assets/UserAssets"); AssetDatabase.Refresh();
            var controller = UnityEditor.Animations.AnimatorController.CreateAnimatorControllerAtPathWithClip(controllerPath, animation);
            animator.runtimeAnimatorController = controller;
        }
        Selection.activeGameObject = instance;
        EditorSceneManager.MarkSceneDirty(SceneManager.GetActiveScene());
    }

    [MenuItem("Relay/Create Original Preview Scene")]
    public static void CreatePreview()
    {
        const string scenePath = "Assets/Relay/Scenes/CompanionPreview.unity";
        if (!Application.isBatchMode && !EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
        if (File.Exists(scenePath)) { EditorSceneManager.OpenScene(scenePath); return; }
        Directory.CreateDirectory("Assets/Relay/Scenes"); Directory.CreateDirectory("Assets/Relay/Materials");
        Directory.CreateDirectory("Assets/UserAssets"); Directory.CreateDirectory("Exports");
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var camera = new GameObject("Preview Camera").AddComponent<Camera>();
        camera.transform.position = new Vector3(0, 1.15f, -4.5f);
        camera.transform.LookAt(new Vector3(0, 1.05f, 0));
        camera.backgroundColor = new Color(0.12f, 0.15f, 0.17f); camera.clearFlags = CameraClearFlags.SolidColor;
        camera.orthographic = true; camera.orthographicSize = 1.55f; camera.gameObject.tag = "MainCamera";
        var key = new GameObject("Key Light").AddComponent<Light>(); key.type = LightType.Directional; key.intensity = 1.5f; key.transform.rotation = Quaternion.Euler(35, -35, 0);
        RenderSettings.ambientLight = new Color(0.55f, 0.6f, 0.65f);
        Material shell = MaterialAsset("Shell", new Color(0.92f, 0.96f, 0.95f));
        Material mint = MaterialAsset("Mint", new Color(0.35f, 0.8f, 0.65f));
        Material dark = MaterialAsset("Face", new Color(0.06f, 0.1f, 0.12f));
        Material coral = MaterialAsset("Coral", new Color(1, 0.52f, 0.32f));
        var root = new GameObject("Original Relay Robot");
        var motion = root.AddComponent<CompanionPreview>();
        Part("Body", root.transform, new Vector3(0, 0.95f, 0), new Vector3(0.66f, 0.65f, 0.42f), mint);
        motion.head = Part("Head", root.transform, new Vector3(0, 1.6f, 0), new Vector3(0.95f, 0.68f, 0.5f), shell);
        Part("Face", motion.head, new Vector3(0, 0, -0.52f), new Vector3(0.84f, 0.77f, 0.07f), dark, true);
        Part("Left Eye", motion.head, new Vector3(-0.21f, 0.03f, -0.57f), new Vector3(0.075f, 0.28f, 0.05f), mint, true);
        Part("Right Eye", motion.head, new Vector3(0.21f, 0.03f, -0.57f), new Vector3(0.075f, 0.28f, 0.05f), mint, true);
        Part("Mouth", motion.head, new Vector3(0, -0.2f, -0.57f), new Vector3(0.14f, 0.04f, 0.05f), mint, true);
        motion.leftArm = Part("Left Arm", root.transform, new Vector3(-0.5f, 0.9f, 0), new Vector3(0.18f, 0.55f, 0.22f), shell);
        motion.rightArm = Part("Right Arm", root.transform, new Vector3(0.5f, 0.9f, 0), new Vector3(0.18f, 0.55f, 0.22f), shell);
        Part("Badge", root.transform, new Vector3(0, 1, -0.24f), new Vector3(0.15f, 0.15f, 0.07f), coral);
        foreach (float x in new[] { -0.2f, 0.2f }) Part("Foot", root.transform, new Vector3(x, 0.3f, -0.04f), new Vector3(0.25f, 0.42f, 0.4f), shell);
        PrefabUtility.SaveAsPrefabAsset(root, "Assets/Relay/OriginalRelayRobot.prefab");
        EditorSceneManager.SaveScene(scene, scenePath);
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(scenePath, true) };
        PlayerSettings.productName = "Relay Asset Studio"; PlayerSettings.companyName = "David";
        AssetDatabase.SaveAssets();
        Debug.Log("RELAY_STUDIO_READY: " + Path.GetFullPath(scenePath));
    }
    private static Material MaterialAsset(string name, Color color)
    {
        var material = new Material(Shader.Find("Standard")) { color = color };
        material.SetFloat("_Glossiness", 0.35f);
        AssetDatabase.CreateAsset(material, "Assets/Relay/Materials/" + name + ".mat"); return material;
    }
    private static Transform Part(string name, Transform parent, Vector3 position, Vector3 scale, Material material, bool local = false)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube); go.name = name;
        go.transform.SetParent(parent, false); go.transform.localPosition = position; go.transform.localScale = scale;
        go.GetComponent<Renderer>().sharedMaterial = material; DestroyImmediate(go.GetComponent<Collider>()); return go.transform;
    }
}
