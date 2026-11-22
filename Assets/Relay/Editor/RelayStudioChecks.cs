using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using Relay.Studio;

public static class RelayStudioChecks
{
    public static void Verify()
    {
        EditorSceneManager.OpenScene("Assets/Relay/Scenes/CompanionPreview.unity");
        var camera = Camera.main;
        var motion = UnityEngine.Object.FindFirstObjectByType<CompanionPreview>();
        if (!camera || !motion || !motion.head || !motion.leftArm || !motion.rightArm) throw new Exception("Preview references are missing.");
        Directory.CreateDirectory("Verification");
        Capture(camera, 1280, 820, "Verification/preview-desktop.png");
        Capture(camera, 390, 844, "Verification/preview-portrait.png");
        Debug.Log("RELAY_STUDIO_CHECKS_PASS: saved scene, original rig references, nonblank desktop/portrait renders.");
    }
    private static void Capture(Camera camera, int width, int height, string file)
    {
        var target = new RenderTexture(width, height, 24);
        var texture = new Texture2D(width, height, TextureFormat.RGB24, false);
        var previous = RenderTexture.active;
        var previousTarget = camera.targetTexture;
        try
        {
            camera.targetTexture = target; camera.Render(); RenderTexture.active = target;
            texture.ReadPixels(new Rect(0, 0, width, height), 0, 0); texture.Apply();
            var pixels = texture.GetPixels32(); var background = pixels[0]; int changed = 0;
            int minX = width, minY = height, maxX = 0, maxY = 0;
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++)
            {
                var p = pixels[y * width + x];
                if (Math.Abs(p.r - background.r) + Math.Abs(p.g - background.g) + Math.Abs(p.b - background.b) < 25) continue;
                changed++; minX = Math.Min(minX, x); maxX = Math.Max(maxX, x); minY = Math.Min(minY, y); maxY = Math.Max(maxY, y);
            }
            if (changed < 1000 || minX < 1 || minY < 1 || maxX >= width - 1 || maxY >= height - 1) throw new Exception("Blank or clipped preview: " + file);
            File.WriteAllBytes(file, texture.EncodeToPNG());
            Debug.Log($"RELAY_RENDER: {width}x{height}, {changed} foreground pixels, bounds {minX},{minY}-{maxX},{maxY}");
        }
        finally
        {
            camera.targetTexture = previousTarget; RenderTexture.active = previous;
            UnityEngine.Object.DestroyImmediate(texture); UnityEngine.Object.DestroyImmediate(target);
        }
    }
}
