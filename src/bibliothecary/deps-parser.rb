require 'bibliothecary'
require 'json'

if ARGV.empty?
  raise "please provide a folder path as a command line argument"
end

# Get the folder path from the command line arguments
folder_path = ARGV[0]

# Check if the provided path is a valid directory
unless File.directory?(folder_path)
  raise "the provided path is not a valid directory"
end

json_data = File.read(File.join(File.dirname(__FILE__), "manifests-patterns.json"))
manifests_ending_patterns_array = JSON.parse(json_data)

unless manifests_ending_patterns_array.is_a?(Array)
  raise TypeError, "expected an array, but got #{manifests_ending_patterns_array.class}."
end

analysis_data = Bibliothecary.analyse(folder_path)

# Each data item represents a file with its dependencies:
# {:platform=>"maven", :path=>"samples/java/build.gradle", :dependencies=>[{:name=>"com.thirdcompany.tool:dependency-gradle-b", :requirement=>"0.0.0", :type=>"implementation"}, {:name=>"dependency-gradle-c:0.0.0", :requirement=>"*", :type=>"api"}, {:name=>"com.thirdcompany.tool:dependency-gradle-e", :requirement=>"*", :type=>"implementation"}], :kind=>"manifest", :success=>true, :related_paths=>[]}

# We focus on core libraries used into projects so only manifests are useful, we skip lockfiles (another argument is it would consume too many tokens during the analysis)
# Since `bibliothecary` has no way to extract patterns for files, we retrieved 99% of those patterns by:
# 1. cloning their repository
# 2. search for `kind: "manifest",` into the folder `lib/bibliothecary/parsers/`
# 3. use the search option `Open in editor`
# 4. copy pattern occurences of filenames and extensions (some are not displayed in the vscode summary but they are easy to find)
# 5. strip start and end to only have meaningful part
# 6. write them into `manifests-patterns.json`
filtered_data = analysis_data.select { |entry|
  entry[:path].end_with?(*manifests_ending_patterns_array)
}

# In case a parsing is wrong we prefer to be notified to investigate if an adjustment is needed
success_entries = []
failed_entries = []
filtered_data.each { |entry|
  if entry[:success] == true
    success_entries.push(entry)
  else
    failed_entries.push(entry)
  end
}

unless failed_entries.empty?
  # We do not raise an error since it's a normal bibliothecary error and if multiple manifests some could work
  # (this is a rare issue, we consider it's like having no manifest or a language we cannot fetch, no need to notify us about this)

  # [IMPORTANT] The following is commented because we analyze raw stdout from our JavaScript application
  # it's here for debugging purpose when you want to investigate
  debug = false

  if debug
    puts "some manifest entries cannot be analyzed:"

    failed_entries.each { |entry|
      puts "- " + entry[:error_message] + " (" + entry[:error_location] + ")"
    }
  end
end

# Write dependencies to `stdout` so the parent program can parse them easily
success_entries.each do |entry|
  entry[:dependencies].each do |dependency|
    puts dependency[:name]
  end
end
