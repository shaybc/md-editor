package mdeditor.kotlin.abi;

import java.util.concurrent.atomic.AtomicBoolean;

import org.eclipse.core.resources.IResourceChangeEvent;
import org.eclipse.core.resources.IResourceChangeListener;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.jobs.Job;
import org.osgi.framework.BundleActivator;
import org.osgi.framework.BundleContext;

/** Reapplies MD-Editor's synthetic container after Gradle/Maven workspace refreshes. */
public final class KotlinAbiBundleActivator implements BundleActivator, IResourceChangeListener {
    private final AtomicBoolean scheduled = new AtomicBoolean();

    @Override
    public void start(BundleContext context) {
        ResourcesPlugin.getWorkspace().addResourceChangeListener(this, IResourceChangeEvent.POST_CHANGE);
    }

    @Override
    public void stop(BundleContext context) {
        ResourcesPlugin.getWorkspace().removeResourceChangeListener(this);
    }

    @Override
    public void resourceChanged(IResourceChangeEvent event) {
        if (!this.scheduled.compareAndSet(false, true)) return;
        Job.createSystem("Reapply MD-Editor Kotlin ABI classpaths", monitor -> {
            try {
                KotlinAbiClasspathContainer.reapplyAll(monitor);
            } finally {
                this.scheduled.set(false);
            }
        }).schedule(250L);
    }
}
